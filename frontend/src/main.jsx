import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8080'

function App() {
  const [profile, setProfile] = useState(null)
  const [repos, setRepos] = useState([])
  const [thm, setThm] = useState(null)
  const [editing, setEditing] = useState({})

  const load = async () => {
    const [p, r, t] = await Promise.all([
      fetch(`${API}/api/profile`).then((x) => x.json()),
      fetch(`${API}/api/repos`).then((x) => x.json()),
      fetch(`${API}/api/tryhackme`).then((x) => x.json())
    ])
    setProfile(p)
    setRepos(r)
    setThm(t)
  }

  useEffect(() => {
    load()
  }, [])

  const saveRepo = async (repoName) => {
    await fetch(`${API}/api/admin/repo/${repoName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing[repoName])
    })
    await load()
  }

  const updatePinOrder = (repoName, dir) => {
    const current = repos.find((r) => r.name === repoName)
    const pinOrder = Math.max(0, (current?.pinOrder || 0) + dir)
    setEditing((prev) => ({
      ...prev,
      [repoName]: { ...current, ...(prev[repoName] || {}), pinned: true, pinOrder }
    }))
  }

  const languages = useMemo(() => profile?.languages || [], [profile])

  if (!profile) return <div className="loading">Loading portfolio...</div>

  return (
    <main>
      <section className="hero card">
        <h1>{profile.displayName}</h1>
        <h2>{profile.headline}</h2>
        <p>{profile.bio}</p>
        {profile.cvUrl && <a href={profile.cvUrl} target="_blank">Download CV</a>}
      </section>

      <section className="card">
        <h3>Languages</h3>
        <div className="tags">{languages.map((lang) => <span key={lang} className="tag">{lang}</span>)}</div>
      </section>

      <section className="card">
        <h3>Work Experience</h3>
        {profile.experience?.map((exp) => (
          <article key={`${exp.company}-${exp.role}`}>
            <strong>{exp.role}</strong> — {exp.company} <small>{exp.dateRange}</small>
            <ul>{exp.description.map((d) => <li key={d}>{d}</li>)}</ul>
          </article>
        ))}
      </section>

      <section className="card">
        <h3>Certifications</h3>
        {profile.certifications?.map((c) => (
          <div key={c.name}><a href={c.url} target="_blank">{c.name}</a> · {c.issuer} · {c.date}</div>
        ))}
      </section>

      <section className="card">
        <h3>TryHackMe Stats</h3>
        <pre>{JSON.stringify(thm, null, 2)}</pre>
      </section>

      <section className="card">
        <div className="row"><h3>Projects (Auto-synced from GitHub)</h3><button onClick={() => fetch(`${API}/api/admin/refresh`, { method: 'POST' }).then(load)}>Refresh</button></div>
        {repos.map((repo) => {
          const state = editing[repo.name] || repo
          return (
            <article className="repo" key={repo.id}>
              <div className="row">
                <a href={repo.url} target="_blank"><strong>{repo.name}</strong></a>
                {repo.pinned && <span className="pin">Pinned #{repo.pinOrder}</span>}
              </div>
              <textarea value={state.description || ''} onChange={(e) => setEditing((prev) => ({ ...prev, [repo.name]: { ...state, description: e.target.value } }))} placeholder="Custom description" />
              <textarea value={state.readme || ''} onChange={(e) => setEditing((prev) => ({ ...prev, [repo.name]: { ...state, readme: e.target.value } }))} placeholder="Custom readme/notes" />
              <div className="row">
                <label><input type="checkbox" checked={!!state.pinned} onChange={(e) => setEditing((prev) => ({ ...prev, [repo.name]: { ...state, pinned: e.target.checked } }))} /> Pin</label>
                <button onClick={() => updatePinOrder(repo.name, -1)}>↑</button>
                <button onClick={() => updatePinOrder(repo.name, 1)}>↓</button>
                <button onClick={() => saveRepo(repo.name)}>Save</button>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
