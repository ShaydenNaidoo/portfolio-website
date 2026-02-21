import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8080'
const PROJECT_IMAGE = '/assets/project-fallback.jpeg'
const HERO_VIDEO = '/assets/persona-stars-loop.mp4'
const PROFILE_IMAGE = '/assets/profile-photo.jpeg'
const DEFAULT_SKILLS = ['Offense', 'Defense', 'Web', 'Crypto', 'Forensics']
const FEATURED_PROJECTS = [
  {
    name: 'Green-Cart',
    description: 'Main capstone project for COS301-SE-2025. Featured mission.',
    url: 'https://github.com/COS301-SE-2025/Green-Cart',
    language: 'Capstone',
    pushedAt: null,
    image: PROJECT_IMAGE
  }
]

const pickDeep = (input, matcher) => {
  const queue = [input]
  const seen = new Set()

  while (queue.length) {
    const node = queue.shift()
    if (!node || typeof node !== 'object' || seen.has(node)) {
      continue
    }
    seen.add(node)

    for (const [key, value] of Object.entries(node)) {
      if (matcher(key, value)) {
        return value
      }
      if (value && typeof value === 'object') {
        queue.push(value)
      }
    }
  }

  return undefined
}

const unwrapTryHackMe = (payload) => {
  if (!payload) {
    return null
  }

  if (payload.enabled === false) {
    return { __disabled: true, __message: payload.message || 'TryHackMe integration is disabled.' }
  }

  let node = payload
  for (let i = 0; i < 5; i += 1) {
    if (node && typeof node === 'object' && node.data && typeof node.data === 'object') {
      node = node.data
    } else {
      break
    }
  }

  return node
}

const normalizeSkillValue = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) {
    return 0
  }
  return num <= 1 ? num * 100 : num
}

const extractRank = (data) => pickDeep(data, (key, value) => /(global.?rank|world.?rank|^rank$|ranking)/i.test(key) && (typeof value === 'number' || typeof value === 'string'))

const extractRoomCount = (data) => {
  const value = pickDeep(data, (key, v) => /(completedroomsnumber|rooms?completed|completedrooms|roomcount|rooms_count)/i.test(key) && (typeof v === 'number' || typeof v === 'string'))
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const extractRooms = (data) => {
  const rooms = pickDeep(data, (key, value) => /(completedrooms|roomscompleted|roomslist|rooms)/i.test(key) && Array.isArray(value) && value.length > 0)
  if (!Array.isArray(rooms)) {
    return []
  }

  return rooms
    .map((room) => {
      if (typeof room === 'string') {
        return room
      }
      if (room && typeof room === 'object') {
        return room.title || room.name || room.roomName || room.slug || ''
      }
      return ''
    })
    .filter(Boolean)
}

const extractSkills = (data) => {
  let matrix = null
  if (data && typeof data === 'object') {
    const directMatrix = data.skillsMatrix || data.skills_matrix
    if (Array.isArray(directMatrix) || (directMatrix && typeof directMatrix === 'object')) {
      matrix = directMatrix
    }
  }
  if (!matrix) {
    matrix = pickDeep(data, (key, value) => /(skills?matrix|skillmatrix|skills?$)/i.test(key) && (Array.isArray(value) || (value && typeof value === 'object')))
  }
  if (!matrix) {
    return []
  }

  const entries = []

  if (Array.isArray(matrix)) {
    for (const item of matrix) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const name = item.name || item.skill || item.category || item.title
      const value = normalizeSkillValue(item.score ?? item.level ?? item.value ?? item.percent ?? item.percentage)
      if (name && value >= 0) {
        entries.push({ name: String(name), value })
      }
    }
  } else {
    for (const [name, value] of Object.entries(matrix)) {
      if (typeof value === 'number' || typeof value === 'string') {
        entries.push({ name, value: normalizeSkillValue(value) })
        continue
      }
      if (value && typeof value === 'object') {
        const numeric = normalizeSkillValue(value.score ?? value.level ?? value.value ?? value.percent ?? value.percentage)
        entries.push({ name, value: numeric })
      }
    }
  }

  return entries
    .filter((entry) => entry.name)
    .sort((a, b) => b.value - a.value)
}

const formatDate = (iso) => {
  if (!iso) {
    return 'N/A'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'N/A'
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return String(value || 'Unknown')
  }
  return new Intl.NumberFormat().format(num)
}

function SkillStar({ skills }) {
  const displaySkills = useMemo(() => {
    const picked = [...skills.slice(0, 5)]
    while (picked.length < 5) {
      picked.push({ name: DEFAULT_SKILLS[picked.length], value: 0 })
    }
    return picked
  }, [skills])

  const center = 200
  const radius = 145
  const maxValue = Math.max(...displaySkills.map((skill) => skill.value || 0), 1)

  const starPoints = (scale = 1) => {
    const points = []
    for (let i = 0; i < 5; i += 1) {
      const angle = (-Math.PI / 2) + (i * (Math.PI * 2 / 5))
      const x = center + Math.cos(angle) * radius * scale
      const y = center + Math.sin(angle) * radius * scale
      points.push(`${x},${y}`)
    }
    return points.join(' ')
  }

  const graph = displaySkills.map((skill, i) => {
    const ratio = Math.max(0.15, Math.min(1, (skill.value || 0) / maxValue))
    const angle = (-Math.PI / 2) + (i * (Math.PI * 2 / 5))
    const x = center + Math.cos(angle) * radius * ratio
    const y = center + Math.sin(angle) * radius * ratio
    const lx = center + Math.cos(angle) * (radius + 30)
    const ly = center + Math.sin(angle) * (radius + 30)
    return { x, y, lx, ly, name: skill.name }
  })

  return (
    <svg viewBox="0 0 400 400" aria-label="TryHackMe skills star chart" role="img">
      <polygon points={starPoints(1)} fill="rgba(255,255,255,0.08)" stroke="#202020" strokeWidth="18" />

      {[1, 2, 3, 4].map((step) => (
        <polygon
          key={step}
          points={starPoints(step / 4)}
          fill="none"
          stroke={step === 4 ? '#4a4a4a' : '#2e2e2e'}
          strokeWidth={step === 4 ? 4 : 2}
        />
      ))}

      <polygon
        points={graph.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="rgba(244,188,17,0.45)"
        stroke="#ffd96a"
        strokeWidth="3"
      />

      {graph.map((point) => (
        <circle key={`node-${point.name}`} cx={point.x} cy={point.y} r="4" fill="#f4bc11" />
      ))}

      {graph.map((point) => (
        <text
          key={`label-${point.name}`}
          x={point.lx}
          y={point.ly}
          textAnchor="middle"
          fill="#f4bc11"
          fontSize="14"
        >
          {point.name}
        </text>
      ))}

      <polygon points={starPoints(0.18)} fill="#f4bc11" stroke="#d09500" strokeWidth="4" />
    </svg>
  )
}

function App() {
  const [profile, setProfile] = useState(null)
  const [repos, setRepos] = useState([])
  const [thmResponse, setThmResponse] = useState(null)
  const [selectedProject, setSelectedProject] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const carouselRef = useRef(null)

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [profileRes, reposRes, thmRes] = await Promise.all([
        fetch(`${API}/api/profile`),
        fetch(`${API}/api/repos`),
        fetch(`${API}/api/tryhackme`)
      ])

      if (!profileRes.ok || !reposRes.ok || !thmRes.ok) {
        throw new Error('Unable to load one or more API resources.')
      }

      const [profileJson, reposJson, thmJson] = await Promise.all([
        profileRes.json(),
        reposRes.json(),
        thmRes.json()
      ])

      setProfile(profileJson)
      setRepos(Array.isArray(reposJson) ? reposJson : [])
      setThmResponse(thmJson)
    } catch (loadError) {
      setError(loadError.message || 'Failed to load portfolio data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const projects = useMemo(() => {
    const curated = FEATURED_PROJECTS.map((project) => ({ ...project }))
    const seenUrls = new Set(curated.map((project) => (project.url || '').toLowerCase()))
    const seenNames = new Set(curated.map((project) => project.name.toLowerCase()))

    const repoProjects = repos
      .map((repo) => ({
        name: repo.name,
        description: repo.description || 'No description available yet.',
        url: repo.url,
        language: repo.language || 'Unknown',
        pushedAt: repo.pushedAt,
        image: PROJECT_IMAGE
      }))
      .filter((project) => {
        const urlKey = (project.url || '').toLowerCase()
        const nameKey = project.name.toLowerCase()
        if ((urlKey && seenUrls.has(urlKey)) || seenNames.has(nameKey)) {
          return false
        }
        if (urlKey) {
          seenUrls.add(urlKey)
        }
        seenNames.add(nameKey)
        return true
      })

    const merged = [...curated, ...repoProjects]
    if (!merged.length) {
      return [
        {
          name: 'Mission Slot',
          description: 'Projects will appear here once repository data loads from GitHub.',
          url: '#',
          language: 'N/A',
          pushedAt: null,
          image: PROJECT_IMAGE
        }
      ]
    }

    return merged
  }, [repos])

  useEffect(() => {
    if (selectedProject > projects.length - 1) {
      setSelectedProject(0)
    }
  }, [projects, selectedProject])

  const selected = projects[selectedProject] || projects[0]

  const thmData = useMemo(() => unwrapTryHackMe(thmResponse), [thmResponse])
  const thmDisabled = Boolean(thmData?.__disabled)
  const thmRank = useMemo(() => extractRank(thmData), [thmData])
  const thmRooms = useMemo(() => extractRooms(thmData), [thmData])
  const thmRoomCount = useMemo(() => extractRoomCount(thmData), [thmData])
  const thmSkills = useMemo(() => extractSkills(thmData), [thmData])
  const thmSkillsError = thmData?.skillsError || ''

  const languages = profile?.languages || []
  const experiences = profile?.experience || []
  const certifications = profile?.certifications || []

  if (loading && !profile) {
    return <div className="loading">Loading Persona interface...</div>
  }

  return (
    <div className="app">
      <div className="backdrop-pattern" aria-hidden="true" />

      <header className="hero" id="top">
        <div className="hero-banner">
          <video className="hero-video" autoPlay muted loop playsInline>
            <source src={HERO_VIDEO} type="video/mp4" />
          </video>
          <div className="hero-scrim" />
          <div className="hero-cutout" />
        </div>

        <div className="hero-content shell">
          <img src={PROFILE_IMAGE} alt={profile?.displayName || 'Profile'} className="profile-photo" />

          <div className="profile-block">
            <p className="label-chip">Phantom Profile</p>
            <h1>{profile?.displayName || 'Shayden Naidoo'}</h1>
            <p className="headline">{profile?.headline || 'Cybersecurity and Software Engineering'}</p>
            <p>{profile?.bio || 'Portfolio profile loading.'}</p>
          </div>
        </div>
      </header>

      <main className="shell">
        {error && <section className="panel warning-panel">Data load warning: {error}</section>}

        <section className="panel projects-panel" id="projects">
          <div className="panel-title-wrap">
            <h2 className="panel-title">Missions</h2>
          </div>
          <p className="section-lead">Hover a card to lock target. Border highlights mirror Persona menu selection.</p>

          <div className="carousel-wrap">
            <button
              className="carousel-control"
              type="button"
              aria-label="Previous project"
              onClick={() => carouselRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}
            >
              &#10094;
            </button>

            <div className="projects-carousel" ref={carouselRef}>
              {projects.map((project, index) => (
                <button
                  key={`${project.name}-${index}`}
                  className={`project-card ${index === selectedProject ? 'is-selected' : ''}`}
                  type="button"
                  onMouseEnter={() => setSelectedProject(index)}
                  onFocus={() => setSelectedProject(index)}
                  onClick={() => setSelectedProject(index)}
                  aria-label={`Select ${project.name}`}
                >
                  <div className="project-image-frame">
                    <img src={project.image} alt={project.name} loading="lazy" />
                  </div>
                  <div className="project-caption">
                    <h3>{project.name}</h3>
                  </div>
                </button>
              ))}
            </div>

            <button
              className="carousel-control"
              type="button"
              aria-label="Next project"
              onClick={() => carouselRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}
            >
              &#10095;
            </button>
          </div>

          <article className="project-focus" aria-live="polite">
            <div className="project-focus-image-frame">
              <img src={selected.image} alt={selected.name} />
            </div>
            <div className="project-focus-info">
              <p className="label-chip">Selected Mission</p>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
              <div className="meta-row">
                <span>Language: {selected.language}</span>
                <span>Updated: {formatDate(selected.pushedAt)}</span>
              </div>
              <a href={selected.url || '#'} target="_blank" rel="noreferrer">Open Repository</a>
            </div>
          </article>
        </section>

        <section className="panel thm-panel" id="tryhackme">
          <div className="panel-title-wrap">
            <h2 className="panel-title">TryHackMe Intel</h2>
          </div>

          {thmDisabled ? (
            <p>{thmData.__message}</p>
          ) : (
            <div className="thm-grid">
              <div className="thm-star-card">
                <SkillStar skills={thmSkills} />
                <p className="thm-sync">Live sync source: /api/tryhackme</p>
              </div>

              <div className="thm-summary-card">
                <div className="summary-stat">
                  <p className="stat-label">Global Rank</p>
                  <p className="stat-value">{formatNumber(thmRank || 'Unknown')}</p>
                </div>
                <div className="summary-stat">
                  <p className="stat-label">Rooms Completed</p>
                  <p className="stat-value">{formatNumber(thmRoomCount ?? (thmRooms.length || 'Unknown'))}</p>
                </div>
                <div className="summary-stat">
                  <p className="stat-label">Skills Tracked</p>
                  <p className="stat-value">{thmSkills.length}</p>
                </div>
              </div>

              <div className="thm-skills-card">
                <h3>Skills Matrix</h3>
                <div className="skill-list">
                  {thmSkills.length ? (
                    thmSkills.map((skill) => {
                      const max = Math.max(...thmSkills.map((item) => item.value), 1)
                      return (
                        <div className="skill-item" key={skill.name}>
                          <strong>{skill.name}</strong>
                          <span>{Math.round(skill.value)}</span>
                          <div className="skill-bar"><span style={{ width: `${Math.max(6, (skill.value / max) * 100)}%` }} /></div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="empty-note">No skill matrix fields were found in the current TryHackMe payload.</p>
                  )}
                </div>
              </div>

              <div className="thm-rooms-card">
                <h3>Completed Rooms</h3>
                {thmRooms.length ? (
                  <ul>
                    {thmRooms.slice(0, 20).map((room) => <li key={room}>{room}</li>)}
                    {thmRooms.length > 20 && <li>+{thmRooms.length - 20} more rooms</li>}
                  </ul>
                ) : (
                  <p className="empty-note">Room names are not exposed by this TryHackMe response. Count is still shown above.</p>
                )}
              </div>

              {thmSkillsError && (
                <div className="thm-rooms-card">
                  <h3>Skills Sync Note</h3>
                  <p className="empty-note">{thmSkillsError}</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel about-panel" id="about">
          <div className="panel-title-wrap">
            <h2 className="panel-title">Profile Intel</h2>
          </div>
          <div className="info-grid">
            <article className="mini-panel">
              <h3>Languages</h3>
              <div className="tags">
                {languages.map((lang) => <span key={lang} className="tag">{lang}</span>)}
              </div>
            </article>

            <article className="mini-panel">
              <h3>Experience</h3>
              {experiences.map((exp) => (
                <div key={`${exp.company}-${exp.role}`} className="stack-item">
                  <strong>{exp.role}</strong>
                  <p>{exp.company} · {exp.dateRange}</p>
                </div>
              ))}
            </article>

            <article className="mini-panel">
              <h3>Certifications</h3>
              {certifications.map((cert) => (
                <div key={`${cert.name}-${cert.date}`} className="stack-item">
                  <a href={cert.url} target="_blank" rel="noreferrer">{cert.name}</a>
                  <p>{cert.issuer} · {cert.date}</p>
                </div>
              ))}
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>&copy; 2026 Shayden Naidoo. All rights reserved.</p>
        <p className="font-credit">Font attribution: <a href="http://www.onlinewebfonts.com" target="_blank" rel="noreferrer">Web Fonts</a></p>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
