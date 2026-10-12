import { describe, expect, it, vi } from 'vitest';
import { handleActionClick } from '../src/background/action';
import { connectPlayback, TabAudioCapture } from '../src/audio-capture/capture';
import { downsample, encodeWav, rms } from '../src/audio-capture/wav';
import { TaskQueue } from '../src/fact-check-provider/queue';
import { backendRequest, BackendError } from '../src/shared/backend';
import { TranscribeResponse, type Session } from '../src/shared/schemas';
import { counts, groupByTopic, matchesFilter } from '../src/sidepanel/selectors';
import { claimOf } from './helpers';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('clique no ícone', () => {
  it('abre o painel na aba clicada, guarda a aba-alvo e NÃO inicia captura', async () => {
    const openPanel = vi.fn(async () => undefined);
    const saveTarget = vi.fn(async () => undefined);
    await handleActionClick({ id: 42, title: 'Debate ao vivo', url: 'https://globoplay.globo.com/x' }, { openPanel, saveTarget });
    expect(openPanel).toHaveBeenCalledWith(42);
    expect(saveTarget).toHaveBeenCalledWith({ tabId: 42, title: 'Debate ao vivo', url: 'https://globoplay.globo.com/x' });
  });
  it('chama openPanel de forma síncrona (dentro do gesto do usuário)', () => {
    const order: string[] = [];
    const p = handleActionClick({ id: 1 }, { openPanel: async () => void order.push('open'), saveTarget: async () => void order.push('save') });
    expect(order[0]).toBe('open'); // antes de qualquer await
    return p;
  });
  it('ignora cliques sem aba', async () => {
    const openPanel = vi.fn(async () => undefined);
    await handleActionClick({}, { openPanel, saveTarget: vi.fn(async () => undefined) });
    expect(openPanel).not.toHaveBeenCalled();
  });
  it('manifest declara painel lateral e o ícone sem abrir automaticamente a captura', () => {
    const m = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
    expect(m.manifest_version).toBe(3);
    expect(m.side_panel.default_path).toBe('sidepanel.html');
    expect(m.permissions).toEqual(expect.arrayContaining(['tabCapture', 'sidePanel', 'offscreen', 'activeTab']));
    expect(m.action).toBeDefined();
    expect(m.host_permissions.every((h: string) => /127\.0\.0\.1|localhost/.test(h))).toBe(true);
  });
});

function fakeCtx(sampleRate = 48_000) {
  const connections: string[] = [];
  let processor: { onaudioprocess: ((e: { inputBuffer: unknown }) => void) | null; connect: (n: { id?: string }) => void; disconnect: () => void } | undefined;
  const ctx = {
    sampleRate,
    destination: { id: 'destination' },
    createMediaStreamSource: () => ({ connect: (n: { id?: string }) => connections.push(n.id ?? 'node') }),
    createScriptProcessor: () => (processor = { onaudioprocess: null, connect: (n) => connections.push(`proc->${n.id ?? 'node'}`), disconnect: vi.fn() }),
    close: vi.fn(async () => undefined),
  };
  const feed = (samples: Float32Array) => processor?.onaudioprocess?.({ inputBuffer: { length: samples.length, numberOfChannels: 1, getChannelData: () => samples } });
  return { ctx: ctx as unknown as AudioContext, connections, feed };
}

const tone = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 7));

describe('WAV e reamostragem', () => {
  it('gera cabeçalho WAV PCM16 mono válido', () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 0.5]), 16_000);
    const v = new DataView(wav.buffer);
    const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(wav.length).toBe(44 + 8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
  it('limita amostras fora de [-1, 1]', () => {
    const v = new DataView(encodeWav(Float32Array.from([5, -5]), 8000).buffer);
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([32767, -32768]);
  });
  it('reduz 48 kHz → 16 kHz e não altera quando já está na taxa-alvo', () => {
    expect(downsample(new Float32Array(48_000), 48_000, 16_000)).toHaveLength(16_000);
    const same = new Float32Array(10);
    expect(downsample(same, 16_000, 16_000)).toBe(same);
  });
  it('rms', () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5);
  });
});

describe('captura de áudio', () => {
  it('preserva o áudio original: o stream é reconectado ao destination', () => {
    const { ctx, connections } = fakeCtx();
    connectPlayback(ctx, {} as MediaStream);
    expect(connections).toContain('destination');
  });

  function harness() {
    const c = fakeCtx(48_000);
    const chunks: [Blob, number][] = [];
    const track = { addEventListener: vi.fn(), stop: vi.fn() };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const onEnded = vi.fn();
    // 1 s por trecho para o teste ficar curto: 48.000 amostras
    const cap = new TabAudioCapture(() => c.ctx, { chunkMs: 1000, speechThreshold: 0.01, onChunk: (b, o) => chunks.push([b, o]), onEnded });
    return { cap, stream, chunks, track, onEnded, ...c };
  }

  it('o áudio continua tocando ao iniciar (source → destination)', () => {
    const h = harness();
    h.cap.start(h.stream);
    expect(h.connections).toContain('destination');
  });
  it('envia WAV 16 kHz só para trechos com fala; silêncio não é enviado; offset acompanha o tempo', async () => {
    const h = harness();
    h.cap.start(h.stream);
    for (let i = 0; i < 12; i++) h.feed(new Float32Array(4096)); // ~1,02 s de silêncio
    expect(h.chunks).toHaveLength(0);
    for (let i = 0; i < 12; i++) h.feed(tone(4096, 0.3)); // ~1,02 s de fala
    expect(h.chunks).toHaveLength(1);
    const [blob, offset] = h.chunks[0]!;
    expect(blob.type).toBe('audio/wav');
    expect(offset).toBeCloseTo(1024, -1); // começou após ~1 s de silêncio
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(16_000);
    expect(bytes.length).toBeGreaterThan(44 + 16_000 * 2 * 0.9); // ~1 s em PCM16 @16 kHz
  });
  it('pausar descarta o trecho em curso e para de enviar, sem fechar o áudio; retomar volta', () => {
    const h = harness();
    h.cap.start(h.stream);
    for (let i = 0; i < 6; i++) h.feed(tone(4096, 0.3));
    h.cap.pause();
    for (let i = 0; i < 20; i++) h.feed(tone(4096, 0.3));
    expect(h.chunks).toHaveLength(0);
    expect(h.cap.isRecording).toBe(false);
    expect(h.ctx.close).not.toHaveBeenCalled(); // playback continua
    h.cap.resume();
    for (let i = 0; i < 12; i++) h.feed(tone(4096, 0.3));
    expect(h.chunks).toHaveLength(1);
  });
  it('encerrar libera faixas e contexto; fim espontâneo da faixa avisa o chamador', () => {
    const h = harness();
    h.cap.start(h.stream);
    h.cap.stop();
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.ctx.close).toHaveBeenCalled();
    const h2 = harness();
    h2.cap.start(h2.stream);
    (h2.track.addEventListener.mock.calls[0]![1] as () => void)();
    expect(h2.onEnded).toHaveBeenCalled();
  });
});

describe('TaskQueue', () => {
  it('limita concorrência', async () => {
    const q = new TaskQueue(2, 1000);
    let running = 0, peak = 0;
    await Promise.all(Array.from({ length: 6 }, () => q.run(async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; })));
    expect(peak).toBe(2);
  });
  it('aplica timeout por tarefa', async () => {
    const q = new TaskQueue(1, 20);
    await expect(q.run((signal) => new Promise((_r, rej) => signal.addEventListener('abort', () => rej(new Error('abortado')))))).rejects.toThrow('abortado');
  });
  it('cancelAll aborta as em andamento e rejeita as que esperam', async () => {
    const q = new TaskQueue(1, 5000);
    const a = q.run((s) => new Promise((_r, rej) => s.addEventListener('abort', () => rej(new Error('a')))));
    const b = q.run(async () => 'nunca');
    q.cancelAll();
    await expect(a).rejects.toThrow('a');
    await expect(b).rejects.toThrow(/Cancelado/);
  });
});

describe('cliente do backend', () => {
  const settings = { backendUrl: 'http://127.0.0.1:8787', backendToken: 'tok' };
  const respond = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('envia token e valida a resposta', async () => {
    let headers: Record<string, string> = {};
    const f = (async (_u: string, i: RequestInit) => { headers = i.headers as Record<string, string>; return new Response('{"text":"oi"}'); }) as unknown as typeof fetch;
    expect(await backendRequest({ settings, fetchImpl: f }, '/v1/transcribe', {}, TranscribeResponse)).toEqual({ text: 'oi' });
    expect(headers.authorization).toBe('Bearer tok');
  });
  it('classifica erros: auth, http, parse, rede', async () => {
    const run = (f: typeof fetch) => backendRequest({ settings, fetchImpl: f }, '/x', {}, TranscribeResponse).then(() => { throw new Error('deveria falhar'); }, (e: unknown) => e as BackendError);
    expect((await run(respond({}, 401))).kind).toBe('auth');
    const http = await run(respond({ error: 'Gemini API respondeu 502' }, 502));
    expect(http).toMatchObject({ kind: 'http', message: 'Gemini API respondeu 502', transient: true });
    expect((await run(respond({ errado: 1 }))).kind).toBe('parse');
    expect((await run((async () => { throw new TypeError('x'); }) as never)).kind).toBe('network');
    expect((await run(respond({}, 400))).transient).toBe(false);
  });
});

describe('seletores do painel', () => {
  const mk = (): Session => ({
    id: 's', state: 'capturing', tabId: 1, tabTitle: 't', startedAt: 0, segments: [], analyzedSeq: 0, providerMode: 'grounded',
    topics: {
      t1: { id: 't1', title: 'Economia', firstSeenAt: 1, lastActiveAt: 5, claimIds: ['b', 'a', 'c'] },
      t2: { id: 't2', title: 'Saúde', firstSeenAt: 2, lastActiveAt: 9, claimIds: ['d'] },
      t3: { id: 't3', title: 'Vazio', firstSeenAt: 3, lastActiveAt: 10, claimIds: [] },
    },
    claims: {
      a: claimOf({ id: 'a', topicId: 't1', status: 'supported', offsetMs: 10 }),
      b: claimOf({ id: 'b', topicId: 't1', status: 'contradicted', offsetMs: 30 }),
      c: claimOf({ id: 'c', topicId: 't1', status: 'pending', offsetMs: 20 }),
      d: claimOf({ id: 'd', topicId: 't2', status: 'insufficient', offsetMs: 1 }),
    },
  });
  it('conta verificadas e pendentes', () => expect(counts(mk())).toEqual({ verified: 3, pending: 1, total: 4 }));
  it('agrupa por tópico (recentes primeiro), ordem cronológica, sem grupos vazios', () => {
    const g = groupByTopic(mk(), 'all');
    expect(g.map((x) => x.topic.id)).toEqual(['t2', 't1']);
    expect(g[1]?.claims.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });
  it('filtros', () => {
    const s = mk();
    const ids = (f: Parameters<typeof matchesFilter>[1]) => groupByTopic(s, f).flatMap((g) => g.claims.map((c) => c.id)).sort();
    expect(ids('contradicted')).toEqual(['b']);
    expect(ids('supported')).toEqual(['a']);
    expect(ids('pending')).toEqual(['c']);
    expect(ids('inconclusive')).toEqual(['d']);
  });
});

describe('proteção de credenciais', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('o código da extensão (src/) nunca referencia chaves nem endpoints de provedores LLM diretamente', () => {
    for (const f of walk('src').filter((p) => /\.(ts|tsx)$/.test(p))) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/OPENROUTER_API_KEY|GEMINI_API_KEY|openrouter\.ai\/api|x-goog-api-key|generativelanguage\.googleapis\.com|sk-or-/);
    }
  });
  it('o bundle gerado (se existir) não contém chave nem endpoint de LLM', () => {
    if (!existsSync('dist')) return;
    for (const f of walk('dist').filter((p) => /\.(js|html|json)$/.test(p))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/OPENROUTER_API_KEY|GEMINI_API_KEY|openrouter\.ai\/api|x-goog-api-key|generativelanguage\.googleapis\.com|AIza[0-9A-Za-z_-]{20,}|sk-or-[0-9a-z-]{10,}/);
    }
  });
  it('.env.example não contém segredo real e .env está no .gitignore', () => {
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^GOOGLE_API_KEY=$/m);
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.env$/m);
  });
});
