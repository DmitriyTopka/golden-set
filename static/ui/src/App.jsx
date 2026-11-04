import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

const TAGLINE = 'See which support answers break when you edit a help article.';
const REASONS = {
  no_public_agent_answer: 'No public answer from an agent',
  reopened: 'Reopened after it was resolved',
  customer_followed_up: 'Customer wrote back after the answer',
  low_csat: 'Low satisfaction rating',
  empty_question: 'Empty question',
  answer_has_no_content: 'The answer has no content to test (only a link or a word)',
  marked_not_golden: 'Marked "not golden" by an admin',
};

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Setup({ overview, onSaved }) {
  const [spaces, setSpaces] = useState(null);
  const [space, setSpace] = useState(overview.config?.spaceKey || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (overview.isAdmin) invoke('listSources').then((r) => setSpaces(r.spaces)).catch((e) => setError(e.message));
  }, [overview.isAdmin]);

  const save = async () => {
    setError('');
    try {
      await invoke('saveConfig', { spaceKey: space });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!overview.isAdmin) {
    return overview.config ? null : <p className="muted">A project administrator needs to connect a knowledge base space first.</p>;
  }
  if (!spaces) return <p className="muted">{error || 'Loading Confluence spaces…'}</p>;
  return (
    <section className="card">
      <h2>1. Which knowledge base do agents answer from?</h2>
      <div className="row">
        <label>
          Service project
          <input value={overview.projectKey} disabled />
        </label>
        <label>
          Knowledge base space
          <select value={space} onChange={(e) => setSpace(e.target.value)}>
            <option value="">Choose…</option>
            {spaces.map((s) => (
              <option key={s.key} value={s.key}>{`${s.name} (${s.key})`}</option>
            ))}
          </select>
        </label>
        <button disabled={!space} onClick={save}>Save</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function useStepper(startFn, stepFn, isDone) {
  const [state, setState] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setRunning(true);
    setError('');
    try {
      let st = startFn ? await startFn() : null;
      setState(st);
      for (let guard = 0; guard < 200 && !(st && isDone(st)); guard += 1) {
        st = await stepFn();
        setState(st);
        if (st?.error) throw new Error(st.error);
      }
      return st;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setRunning(false);
    }
  };
  return { state, running, error, run };
}

function PairTable({ pairs, onToggle, actionLabel = 'Not golden' }) {
  const [article, setArticle] = useState('');
  const titles = [...new Set(pairs.map((p) => p.articleTitle).filter(Boolean))].sort();
  const shown = article ? pairs.filter((p) => p.articleTitle === article) : pairs;
  if (!pairs.length) return <p className="muted">Nothing here yet.</p>;
  return (
    <>
      {titles.length > 1 && (
        <div className="row filter">
          <label>
            Help article
            <select value={article} onChange={(e) => setArticle(e.target.value)}>
              <option value="">All articles ({pairs.length})</option>
              {titles.map((t) => (
                <option key={t} value={t}>{`${t} (${pairs.filter((p) => p.articleTitle === t).length})`}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Customer question</th>
            <th>Expected answer</th>
            <th>Help article</th>
            <th>Score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.id}</td>
              <td>{p.question}</td>
              <td>{p.expected}</td>
              <td>
                {p.articleTitle || '-'}
                {p.link && <span className={`tag ${p.link.method}`}>{p.link.method === 'link' ? 'linked' : 'by fact'}</span>}
              </td>
              <td>{p.score}</td>
              <td>{onToggle && <button className="subtle" onClick={() => onToggle(p.id)}>{actionLabel}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function App() {
  const [overview, setOverview] = useState(null);
  const [pairs, setPairs] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [ov, pr] = await Promise.all([invoke('getOverview'), invoke('getPairs')]);
      setOverview(ov);
      setPairs(pr);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const seed = useStepper(null, () => invoke('seedNext'), (s) => s.phase === 'done');
  const scan = useStepper(
    () => invoke('scanStart'),
    async () => {
      const st = await invoke('scanBatch');
      if (st?.phase === 'selecting') {
        await invoke('scanFinish');
        return { ...st, phase: 'done' };
      }
      return st;
    },
    (s) => s.phase === 'done'
  );

  const exportAll = async () => {
    const files = await invoke('exportCsv', {});
    files.forEach((csv, i) => download(files.length > 1 ? `golden-set-${i + 1}.csv` : 'golden-set.csv', csv));
  };
  const [busy, setBusy] = useState(false);
  const mark = (value) => async (id) => {
    setBusy(true);
    try {
      await invoke('markNotGolden', { id, value });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!overview || !pairs) return <p className="muted">Loading…</p>;
  const s = pairs.summary;

  return (
    <main>
      <header>
        <h1>Golden Set</h1>
        <p className="tagline">{TAGLINE}</p>
      </header>

      <Setup overview={overview} onSaved={refresh} />

      {overview.config && overview.isAdmin && (
        <section className="card">
          <h2>2. Build the golden set</h2>
          <p className="muted">
            Reads resolved requests in <b>{overview.config.projectName}</b> and help articles in <b>{overview.config.spaceName}</b>. Keeps answers that
            really solved the problem, strips personal data and ties every answer to the article it relies on.
          </p>
          <div className="row">
            <button onClick={async () => { await scan.run(); await refresh(); }} disabled={scan.running}>
              {scan.running ? `Reading requests… ${scan.state?.done ?? 0}/${scan.state?.total ?? '?'}` : 'Scan resolved requests'}
            </button>
            {!(s?.requests > 0 && overview.seed?.phase !== 'requests') && (
            <button className="subtle" onClick={async () => { await seed.run(); await refresh(); }} disabled={seed.running || overview.seed?.phase === 'done'}>
              {seed.running
                ? `Loading demo data… ${seed.state?.phase === 'requests' ? `${seed.state.created.length}/${seed.state.total}` : seed.state?.phase || ''}`
                : overview.seed?.phase === 'done'
                  ? 'Demo data loaded'
                  : 'Load demo data (Northwind Gear)'}
            </button>
            )}
          </div>
          {(scan.error || seed.error) && <p className="error">{scan.error || seed.error}</p>}
          {s && (
            <ul className="stats">
              <li><b>{s.requests}</b> resolved requests read</li>
              <li><b>{s.rejected}</b> rejected (reopened, complaint, low CSAT)</li>
              <li><b>{s.duplicates}</b> duplicates folded</li>
              <li><b>{s.selected}</b> golden pairs across <b>{s.articles}</b> articles</li>
            </ul>
          )}
        </section>
      )}

      {s && (
        <section className="card">
          <div className="row spread">
            <h2>3. Golden pairs</h2>
            <button onClick={exportAll} disabled={!pairs.selected.length}>Download CSV for Rovo Evaluations</button>
          </div>
          <PairTable pairs={pairs.selected} onToggle={overview.isAdmin && !busy ? mark(true) : null} />
        </section>
      )}

      {s && pairs.excluded?.length > 0 && (
        <section className="card">
          <h2>Marked not golden by an admin ({pairs.excluded.length})</h2>
          <PairTable pairs={pairs.excluded} onToggle={overview.isAdmin && !busy ? mark(false) : null} actionLabel="Restore" />
        </section>
      )}

      {s && (
        <section className="card">
          <details>
            <summary>
              <b>Why requests were left out</b> ({pairs.rejected.length} rejected, {pairs.duplicates.length} duplicates, {pairs.reserve.length} in reserve)
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {pairs.rejected.map((r) => (
                  <tr key={`r-${r.id}`}>
                    <td className="mono">{r.id}</td>
                    <td>{REASONS[r.reason] || r.reason}</td>
                  </tr>
                ))}
                {pairs.duplicates.map((d) => (
                  <tr key={`d-${d.id}`}>
                    <td className="mono">{d.id}</td>
                    <td>Same question as {d.duplicateOf}</td>
                  </tr>
                ))}
                {pairs.reserve.map((p) => (
                  <tr key={`v-${p.id}`}>
                    <td className="mono">{p.id}</td>
                    <td>{p.link ? `Reserve: lower score (${p.score})` : 'No help article found for this answer'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
    </main>
  );
}
