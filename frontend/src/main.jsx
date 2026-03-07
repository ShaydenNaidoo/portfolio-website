import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8080'
const ADMIN_TOKEN_STORAGE_KEY = 'portfolio_admin_token'
const PROJECT_IMAGE = '/assets/project-fallback.jpeg'
const GREEN_CART_IMAGE = '/assets/project-art/COS301.jpg'
const PROJECT_ART_BASE = '/assets/project-art'
const HERO_VIDEO = '/assets/persona-stars-loop.mp4'
const PROFILE_IMAGE = '/assets/profile-photo.jpeg'
const CV_PDF = '/assets/shayden-naidoo-cv.pdf'
const LINKEDIN_FALLBACK = 'https://www.linkedin.com/in/shayden-naidoo-b0a51b28b/'
const MISSION_TYPES = ['daily', 'study', 'assignment', 'test', 'exam', 'deadline']
const MISSION_PRIORITIES = ['high', 'medium', 'low']
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const THM_SKILL_ORDER = [
  'Security Operations',
  'Incident Response',
  'Malware Analysis',
  'Penetration Testing',
  'Exploitation',
  'Red Teaming'
]
const FEATURED_PROJECTS = [
  {
    name: 'Green-Cart',
    description: 'GreenCart is a purpose-driven e-commerce platform built to promote sustainable consumerism by providing transparent insights into eco-conscious products. Users can explore verified ethical brands, track carbon footprints, and make informed purchases in a seamless digital shopping experience. We won the Agile Process Adoption prize sponsored by Agile Bridge.',
    url: 'https://github.com/COS301-SE-2025/Green-Cart',
    language: 'JavaScript',
    languages: ['JavaScript', 'Python', 'CSS'],
    pushedAt: null,
    image: GREEN_CART_IMAGE
  },
  {
    name: 'VScoders and the Jetbrainstormers (Team 4)',
    description: 'COS214 team project repository for 2024.',
    url: 'https://github.com/COS214-Project-2024/VScoders-and-the-Jetbrainstormers-Team-4',
    language: 'C++',
    languages: ['C++', 'HTML', 'JavaScript', 'CSS'],
    pushedAt: null
  }
]

const MANUAL_PROJECT_IMAGES = {
  'green-cart': `${PROJECT_ART_BASE}/COS301.jpg`,
  'cos-332-computer-networks': `${PROJECT_ART_BASE}/cos-332-computer-networks-p5r.png`,
  'cos-301-computer-networks': `${PROJECT_ART_BASE}/cos-332-computer-networks-p5r.png`,
  'cos301-computer-networks': `${PROJECT_ART_BASE}/cos-332-computer-networks-p5r.png`,
  'cos221-project': `${PROJECT_ART_BASE}/COS_221.png`,
  'cos221project': `${PROJECT_ART_BASE}/COS_221.png`,
  'cos214': `${PROJECT_ART_BASE}/cos214-p5r.png`,
  'portfolio-website': `${PROJECT_ART_BASE}/portfolio-website-p5r.png`,
  'assemblywork': `${PROJECT_ART_BASE}/assemblywork-p5r.png`,
  'vscoders-and-the-jetbrainstormers-team-4': `${PROJECT_ART_BASE}/citybuilder.png`,
  'scapy-to-read-build-network-packets': `${PROJECT_ART_BASE}/scapy.png`
}

const HIDDEN_PROJECT_KEYS = new Set([
  'readme-me',
  'hyperdots',
  'hyperland',
  'shaydennaidoo'
])

const PROJECT_LANGUAGE_OVERRIDES = {
  'green-cart': ['JavaScript', 'Python', 'CSS'],
  'vscoders-and-the-jetbrainstormers-team-4': ['C++', 'HTML', 'JavaScript', 'CSS'],
  'assemblywork': ['Assembly'],
  'cos-332-computer-networks': ['Pascal', 'Java', 'HTML'],
  'cos-301-computer-networks': ['Pascal', 'Java', 'HTML'],
  'cos301-computer-networks': ['Pascal', 'Java', 'HTML'],
  'cos214': ['C++', 'C', 'JavaScript', 'CSS', 'HTML'],
  'hyperdots': ['Shell', 'CSS', 'Python'],
  'portfolio-website': ['JavaScript', 'Go', 'CSS'],
  'scapy-to-read-build-network-packets': ['Python']
}

const normalizeProjectKey = (name) => String(name || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')

const projectImageFor = (projectName, fallbackImage = PROJECT_IMAGE) => {
  const key = normalizeProjectKey(projectName)
  if (key && MANUAL_PROJECT_IMAGES[key]) {
    return MANUAL_PROJECT_IMAGES[key]
  }
  if (key === 'green-cart') {
    return GREEN_CART_IMAGE
  }
  return fallbackImage || PROJECT_IMAGE
}

const parseRouteFromHash = () => {
  const normalized = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  if (normalized === 'cv' || normalized === 'blog' || normalized === 'missions') {
    return normalized
  }
  return 'home'
}

const routeHash = (route) => {
  if (route === 'cv') {
    return '#/cv'
  }
  if (route === 'blog') {
    return '#/blog'
  }
  if (route === 'missions') {
    return '#/missions'
  }
  return '#/'
}

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
  const scaled = num <= 1 ? num * 100 : num
  return Math.max(0, Math.min(100, scaled))
}

const canonicalizeTHMSkillName = (name) => {
  const normalized = String(name || '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }
  if (normalized.includes('security operations') || normalized.includes('secops') || normalized === 'soc') {
    return 'Security Operations'
  }
  if (normalized.includes('incident response')) {
    return 'Incident Response'
  }
  if (normalized.includes('malware analysis') || normalized === 'malware') {
    return 'Malware Analysis'
  }
  if (normalized.includes('penetration testing') || normalized.includes('pentest') || normalized.includes('pentesting')) {
    return 'Penetration Testing'
  }
  if (normalized.includes('exploitation') || normalized.includes('exploit development')) {
    return 'Exploitation'
  }
  if (normalized.includes('red teaming') || normalized.includes('red team')) {
    return 'Red Teaming'
  }
  return ''
}

const orderTHMSkills = (skills) => {
  const scoreBySkill = new Map()
  for (const skill of skills) {
    const canonical = canonicalizeTHMSkillName(skill.name)
    if (!canonical) {
      continue
    }
    const value = normalizeSkillValue(skill.value)
    if (value < 0) {
      continue
    }
    const previous = scoreBySkill.get(canonical) || 0
    if (value > previous) {
      scoreBySkill.set(canonical, value)
    }
  }
  return THM_SKILL_ORDER
    .filter((name) => scoreBySkill.has(name))
    .map((name) => ({ name, value: scoreBySkill.get(name) || 0 }))
}

const buildTHMSkillMatrix = (skills) => {
  const byName = new Map(skills.map((skill) => [skill.name, skill.value]))
  return THM_SKILL_ORDER.map((name) => ({ name, value: normalizeSkillValue(byName.get(name) || 0) }))
}

const extractRank = (data) => pickDeep(data, (key, value) => /(global.?rank|world.?rank|^rank$|ranking)/i.test(key) && (typeof value === 'number' || typeof value === 'string'))

const extractTHMProfileNode = (data) => {
  if (!data || typeof data !== 'object') {
    return null
  }
  if (data.publicProfile && typeof data.publicProfile === 'object') {
    return data.publicProfile
  }
  if (data.profile && typeof data.profile === 'object') {
    return data.profile
  }
  return data
}

const toFiniteNumber = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '')

const stripBracketTags = (value) => String(value || '').replace(/\[[^\]]+\]/g, '').trim()

const extractBracketTags = (value) => {
  const tags = []
  const source = String(value || '')
  const regex = /\[([^\]]+)\]/g
  let match = regex.exec(source)
  while (match) {
    const tag = String(match[1] || '').trim()
    if (tag) {
      tags.push(tag)
    }
    match = regex.exec(source)
  }
  return tags
}

const extractTHMUsername = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return ''
  }
  const direct = [
    profile.username,
    profile.userName,
    profile.displayName,
    profile.display_name,
    profile.name
  ].map(toTrimmedString).find(Boolean)

  if (direct) {
    return stripBracketTags(direct)
  }

  const nested = pickDeep(profile, (key, value) => /(^username$|^user_name$|^displayname$|^display_name$|^name$)/i.test(key) && typeof value === 'string' && value.trim() !== '')
  return stripBracketTags(nested || '')
}

const extractTHMTitleTag = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return ''
  }

  const nameSource = [
    profile.displayName,
    profile.display_name,
    profile.username,
    profile.userName,
    profile.name
  ].map(toTrimmedString).find(Boolean)

  if (nameSource) {
    const nameTags = extractBracketTags(nameSource)
    const explicitTag = nameTags.find((tag) => !/^0x[0-9a-f]+$/i.test(tag))
    if (explicitTag) {
      return explicitTag.toUpperCase()
    }
  }

  const direct = [
    profile.title,
    profile.userTitle,
    profile.rankTitle,
    profile.levelTitle
  ].map(toTrimmedString).find(Boolean)

  if (direct) {
    return direct.toUpperCase()
  }

  const nested = pickDeep(profile, (key, value) => /(title|ranktitle|usertitle)/i.test(key) && typeof value === 'string' && value.trim() !== '')
  return nested ? String(nested).trim().toUpperCase() : ''
}

const extractTHMLevel = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return null
  }
  const direct = [
    profile.level,
    profile.userLevel,
    profile.user_level,
    profile.lvl
  ].map(toFiniteNumber).find((value) => value !== null)

  if (direct !== undefined) {
    return direct === null ? null : Math.round(direct)
  }

  const nested = pickDeep(profile, (key, value) => /(^level$|userlevel|^lvl$)/i.test(key) && (typeof value === 'number' || typeof value === 'string'))
  const parsed = toFiniteNumber(nested)
  return parsed === null ? null : Math.round(parsed)
}

const extractTHMPoints = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return null
  }
  const direct = [
    profile.points,
    profile.userPoints,
    profile.user_points,
    profile.totalPoints,
    profile.total_points,
    profile.xp,
    profile.totalXp
  ].map(toFiniteNumber).find((value) => value !== null)

  if (direct !== undefined) {
    return direct
  }

  const nested = pickDeep(profile, (key, value) => /(user.?points|total.?points|^points$|total.?xp|^xp$)/i.test(key) && (typeof value === 'number' || typeof value === 'string'))
  return toFiniteNumber(nested)
}

const extractTHMAvatar = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return ''
  }
  const direct = [
    profile.avatar,
    profile.avatarUrl,
    profile.profileImage,
    profile.profile_image,
    profile.photo,
    profile.picture
  ].map(toTrimmedString).find(Boolean)

  if (direct) {
    return direct
  }
  const nested = pickDeep(profile, (key, value) => /(avatar|profile.?image|profile.?pic|user.?image|photo|picture)/i.test(key) && typeof value === 'string' && value.trim() !== '')
  return toTrimmedString(nested)
}

const extractRoomCount = (data) => {
  if (data && typeof data === 'object') {
    const direct = data.completedRoomsCount ?? data.completed_rooms_count
    const parsedDirect = Number(direct)
    if (Number.isFinite(parsedDirect)) {
      return parsedDirect
    }
  }
  const value = pickDeep(data, (key, v) => /(completedroomsnumber|rooms?completed|completedrooms|roomcount|rooms_count)/i.test(key) && (typeof v === 'number' || typeof v === 'string'))
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const extractRoomName = (room) => {
  if (typeof room === 'string') {
    return room.trim()
  }
  if (room && typeof room === 'object') {
    return String(room.title || room.name || room.roomName || room.slug || room.code || '').trim()
  }
  return ''
}

const extractRooms = (data) => {
  let rooms = null
  if (data && typeof data === 'object' && Array.isArray(data.completedRooms) && data.completedRooms.length > 0) {
    rooms = data.completedRooms
  }
  if (!rooms) {
    rooms = pickDeep(data, (key, value) => /(completedrooms|roomscompleted|roomslist|allcompletedrooms|rooms)/i.test(key) && Array.isArray(value) && value.length > 0)
  }
  if (!Array.isArray(rooms)) {
    return []
  }

  const seen = new Set()
  const out = []
  for (const room of rooms) {
    const name = extractRoomName(room)
    if (!name) {
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(name)
  }
  return out
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

  return orderTHMSkills(entries.filter((entry) => entry.name))
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

const formatBlogDate = (value) => {
  if (!value) {
    return 'Draft'
  }
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }
  return String(value)
}

const normalizeBlogPost = (post, index) => {
  const title = String(post?.title || '').trim()
  const content = String(post?.content || post?.excerpt || '').trim()
  const imageData = String(post?.imageData || post?.image || post?.imageUrl || '').trim()
  const createdAt = String(post?.createdAt || post?.date || '').trim()
  const id = String(post?.id || `post-${createdAt || 'legacy'}-${index}`)
  const link = String(post?.url || '').trim()

  return {
    id,
    title,
    content,
    imageData,
    createdAt,
    dateLabel: formatBlogDate(createdAt),
    link
  }
}

const parseErrorMessage = async (response, fallback) => {
  const body = await response.text()
  const text = String(body || '').trim()
  if (!text) {
    return fallback
  }
  return text
}

const formatNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return String(value || 'Unknown')
  }
  return new Intl.NumberFormat().format(num)
}

const formatPercent = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return 'N/A'
  }
  return `${num.toFixed(2)}%`
}

const formatMissionType = (value) => {
  const raw = String(value || '').trim()
  if (!raw) {
    return 'Daily'
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const formatMissionPriority = (value) => {
  const raw = String(value || '').trim()
  if (!raw) {
    return 'Medium'
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const normalizeDateOnly = (value) => {
  if (!value) {
    return ''
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateShort = (value) => {
  if (!value) {
    return 'No due date'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const buildCalendarGrid = (monthDate, missions) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const firstDayIndex = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()

  const dueByDate = new Map()
  for (const mission of missions || []) {
    const key = normalizeDateOnly(mission?.dueDate)
    if (!key) {
      continue
    }
    const current = dueByDate.get(key) || []
    current.push(mission)
    dueByDate.set(key, current)
  }

  const cells = []
  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push({ key: `pad-start-${i}`, day: null, missions: [] })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day)
    const key = normalizeDateOnly(date)
    cells.push({
      key,
      day,
      date: key,
      missions: dueByDate.get(key) || []
    })
  }

  while (cells.length % 7 !== 0) {
    const idx = cells.length
    cells.push({ key: `pad-end-${idx}`, day: null, missions: [] })
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

const normalizeLanguageKey = (language) => String(language || '')
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/[.#]/g, '')
  .replace('++', 'pp')

const projectLanguagesFor = (project) => {
  const candidateList = Array.isArray(project?.languages) && project.languages.length
    ? project.languages
    : String(project?.language || '').split(/[,\n|]+/)

  const seen = new Set()
  const normalized = []

  for (const item of candidateList) {
    const label = String(item || '').trim()
    if (!label) {
      continue
    }
    const key = label.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    normalized.push(label)
  }

  return normalized
}

function LanguageIcon({ language }) {
  const key = normalizeLanguageKey(language)

  switch (key) {
    case 'javascript':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="JavaScript icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#f7df1e" stroke="#141414" strokeWidth="1.3" />
          <text x="10" y="12.8" textAnchor="middle" fontSize="7.3" fontWeight="700" fill="#111">JS</text>
        </svg>
      )
    case 'typescript':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="TypeScript icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#3178c6" stroke="#111" strokeWidth="1.3" />
          <text x="10" y="12.8" textAnchor="middle" fontSize="6.8" fontWeight="700" fill="#fff">TS</text>
        </svg>
      )
    case 'css':
    case 'css3':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="CSS icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#264de4" stroke="#0b1f6d" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="5.8" fontWeight="700" fill="#fff">CSS</text>
        </svg>
      )
    case 'html':
    case 'html5':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="HTML icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#e44d26" stroke="#7e2312" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="5.6" fontWeight="700" fill="#fff">HTML</text>
        </svg>
      )
    case 'cpp':
    case 'cxx':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="C++ icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#00599c" stroke="#062645" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="5.4" fontWeight="700" fill="#fff">C++</text>
        </svg>
      )
    case 'c':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="C icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#3f4c6b" stroke="#1a2236" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">C</text>
        </svg>
      )
    case 'java':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Java icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#f06529" stroke="#6b1f0b" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="6.2" fontWeight="700" fill="#fff">JAVA</text>
        </svg>
      )
    case 'python':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Python icon">
          <rect x="2" y="2" width="16" height="8.1" rx="2.6" fill="#3d7db3" />
          <rect x="2" y="9.9" width="16" height="8.1" rx="2.6" fill="#ffd43b" />
          <circle cx="7" cy="6.3" r="0.9" fill="#fff" />
          <circle cx="13" cy="13.7" r="0.9" fill="#1c1c1c" />
        </svg>
      )
    case 'assembly':
    case 'asm':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Assembly icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#5a5a5a" stroke="#232323" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#fff">ASM</text>
        </svg>
      )
    case 'php':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="PHP icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#777bb4" stroke="#2f3252" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="6.2" fontWeight="700" fill="#fff">PHP</text>
        </svg>
      )
    case 'prolog':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Prolog icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#8f2d56" stroke="#3f1023" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="4.8" fontWeight="700" fill="#fff">PRO</text>
        </svg>
      )
    case 'scheme':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Scheme icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#a02c2c" stroke="#471212" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#fff">SCM</text>
        </svg>
      )
    case 'pascal':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Pascal icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#e6b800" stroke="#7a5b00" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="5.1" fontWeight="700" fill="#111">PSC</text>
        </svg>
      )
    case 'go':
    case 'golang':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Go icon">
          <circle cx="10" cy="10" r="8.7" fill="#00add8" stroke="#0e0e0e" strokeWidth="1.3" />
          <text x="10" y="12.6" textAnchor="middle" fontSize="6.8" fontWeight="700" fill="#fff">GO</text>
        </svg>
      )
    case 'bash':
    case 'shell':
    case 'sh':
    case 'zsh':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Shell icon">
          <rect x="1.3" y="2.2" width="17.4" height="15.6" rx="2.1" fill="#121212" stroke="#e6e6e6" strokeWidth="1.3" />
          <path d="M5.2 7.1 8 9.4 5.2 11.6" fill="none" stroke="#f4bc11" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="9.4" y1="11.6" x2="13.8" y2="11.6" stroke="#f4bc11" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'sql':
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="SQL icon">
          <ellipse cx="10" cy="4.8" rx="6.4" ry="2.5" fill="#b6bcc4" />
          <path d="M3.6 4.8v7.7c0 1.4 2.9 2.5 6.4 2.5s6.4-1.1 6.4-2.5V4.8" fill="#8f97a1" />
          <ellipse cx="10" cy="12.5" rx="6.4" ry="2.5" fill="#b6bcc4" />
          <text x="10" y="11.1" textAnchor="middle" fontSize="4.4" fontWeight="700" fill="#111">SQL</text>
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 20 20" role="img" aria-label="Code icon">
          <rect x="1.3" y="1.3" width="17.4" height="17.4" fill="#232323" stroke="#e8e8e8" strokeWidth="1.3" />
          <text x="10" y="12.7" textAnchor="middle" fontSize="7.1" fontWeight="700" fill="#f4bc11">{'</>'}</text>
        </svg>
      )
  }
}

function SkillRadar({ skills }) {
  const orderedSkills = useMemo(() => buildTHMSkillMatrix(skills), [skills])
  const center = 210
  const radius = 145
  const axisCount = orderedSkills.length
  const rings = 8
  const scaleMax = 100

  const toPoint = (index, ratio = 1, extra = 0) => {
    const angle = (-Math.PI / 2) + (index * (Math.PI * 2 / axisCount))
    const magnitude = (radius * ratio) + extra
    return {
      x: center + (Math.cos(angle) * magnitude),
      y: center + (Math.sin(angle) * magnitude)
    }
  }

  const ringPoints = (ratio) => (
    orderedSkills.map((_, index) => {
      const point = toPoint(index, ratio)
      return `${point.x},${point.y}`
    }).join(' ')
  )

  const graphPoints = orderedSkills.map((skill, index) => {
    const ratio = Math.max(0, Math.min(1, skill.value / scaleMax))
    return toPoint(index, ratio)
  })

  return (
    <svg viewBox="0 0 420 420" aria-label="TryHackMe skills radar chart" role="img" className="thm-radar-svg">
      {Array.from({ length: rings }, (_, ringIndex) => ringIndex + 1).map((ring) => (
        <polygon
          key={`ring-${ring}`}
          points={ringPoints(ring / rings)}
          fill="none"
          stroke={ring === rings ? '#4a4a4a' : '#2e2e2e'}
          strokeWidth={ring === rings ? 2.6 : 1.1}
        />
      ))}

      {orderedSkills.map((skill, index) => {
        const edge = toPoint(index)
        return (
          <line
            key={`axis-${skill.name}`}
            x1={center}
            y1={center}
            x2={edge.x}
            y2={edge.y}
            stroke="rgba(188,188,188,0.24)"
            strokeDasharray="4 5"
            strokeWidth="1"
          />
        )
      })}

      <polygon
        points={graphPoints.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="rgba(244,188,17,0.42)"
        stroke="#ffd96a"
        strokeWidth="2.8"
      />

      {graphPoints.map((point, index) => (
        <circle
          key={`node-${orderedSkills[index].name}`}
          cx={point.x}
          cy={point.y}
          r="3.4"
          fill="#f4bc11"
          stroke="#a17100"
          strokeWidth="1.1"
        />
      ))}

      {orderedSkills.map((skill, index) => {
        const labelPoint = toPoint(index, 1, 28)
        const anchor = Math.abs(labelPoint.x - center) < 14 ? 'middle' : (labelPoint.x < center ? 'end' : 'start')
        const labelRows = skill.name.split(' ')
        return (
          <text
            key={`label-${skill.name}`}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor={anchor}
            className="thm-radar-label"
          >
            {labelRows.map((row, rowIndex) => (
              <tspan
                key={`${skill.name}-${row}`}
                x={labelPoint.x}
                dy={rowIndex === 0 ? 0 : 14}
              >
                {rowIndex === labelRows.length - 1 ? `${row} \u2192` : row}
              </tspan>
            ))}
          </text>
        )
      })}

      <text x={center} y={center + 4} textAnchor="middle" className="thm-radar-scale">
        {`Max ${scaleMax}`}
      </text>
    </svg>
  )
}

function App() {
  const [route, setRoute] = useState(() => parseRouteFromHash())
  const [menuOpen, setMenuOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [repos, setRepos] = useState([])
  const [thmResponse, setThmResponse] = useState(null)
  const [selectedProject, setSelectedProject] = useState(0)
  const [loading, setLoading] = useState(route !== 'cv')
  const [error, setError] = useState('')
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '')
  const [adminUsername, setAdminUsername] = useState('admin')
  const [adminChecking, setAdminChecking] = useState(false)
  const [adminNotice, setAdminNotice] = useState('')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [composerContent, setComposerContent] = useState('')
  const [composerImageData, setComposerImageData] = useState('')
  const [composerBusy, setComposerBusy] = useState(false)
  const [composerNotice, setComposerNotice] = useState('')
  const [missionControl, setMissionControl] = useState(null)
  const [missionLoading, setMissionLoading] = useState(false)
  const [missionBusy, setMissionBusy] = useState(false)
  const [missionError, setMissionError] = useState('')
  const [missionNotice, setMissionNotice] = useState('')
  const [missionForm, setMissionForm] = useState({
    title: '',
    description: '',
    type: 'daily',
    priority: 'medium',
    dueDate: '',
    moduleCode: ''
  })
  const [moduleDrafts, setModuleDrafts] = useState({})
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const carouselRef = useRef(null)
  const projectRefs = useRef([])

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

  const loadMissionControl = async (tokenOverride) => {
    const token = String(tokenOverride || adminToken || '').trim()
    if (!token) {
      setMissionControl(null)
      return
    }

    setMissionLoading(true)
    setMissionError('')
    try {
      const response = await fetch(`${API}/api/admin/mission-control`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Failed to load Mission Control data.'))
      }
      const payload = await response.json()
      setMissionControl(payload)
    } catch (missionLoadError) {
      setMissionError(missionLoadError.message || 'Failed to load Mission Control data.')
    } finally {
      setMissionLoading(false)
    }
  }

  const persistAdminToken = (token) => {
    if (!token) {
      window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  }

  const handleAdminLogin = async (event) => {
    event.preventDefault()
    const username = String(loginForm.username || '').trim()
    const password = String(loginForm.password || '').trim()
    if (!username || !password) {
      setAdminNotice('Enter both username and password.')
      return
    }

    setAdminChecking(true)
    setAdminNotice('')
    try {
      const response = await fetch(`${API}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Login failed.'))
      }
      const payload = await response.json()
      const token = String(payload?.token || '').trim()
      if (!token) {
        throw new Error('Login response did not include a token.')
      }

      setAdminToken(token)
      persistAdminToken(token)
      setAdminUsername(String(payload?.username || username))
      setAdminNotice('Admin login successful.')
      setLoginForm({ username, password: '' })
      setRoute('missions')
      window.location.hash = routeHash('missions')
      setMenuOpen(false)
      await loadMissionControl(token)
    } catch (authError) {
      setAdminNotice(authError.message || 'Login failed.')
    } finally {
      setAdminChecking(false)
    }
  }

  const handleAdminLogout = async () => {
    const token = String(adminToken || '').trim()
    setAdminNotice('')

    if (token) {
      try {
        await fetch(`${API}/api/admin/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch {
        // Logout should still clear local session if network request fails.
      }
    }

    setAdminToken('')
    persistAdminToken('')
    setComposerContent('')
    setComposerImageData('')
    setComposerNotice('')
    setMissionControl(null)
    setMissionError('')
    setMissionNotice('')
    setAdminNotice('Logged out.')
  }

  const handleComposerImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      setComposerImageData('')
      return
    }
    if (!file.type.startsWith('image/')) {
      setComposerNotice('Please select an image file.')
      event.target.value = ''
      return
    }
    if (file.size > (4 * 1024 * 1024)) {
      setComposerNotice('Image is too large (max 4MB).')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setComposerImageData(String(reader.result || ''))
      setComposerNotice('')
    }
    reader.onerror = () => {
      setComposerNotice('Could not read selected image.')
    }
    reader.readAsDataURL(file)
  }

  const handleCreateBlogPost = async (event) => {
    event.preventDefault()
    const token = String(adminToken || '').trim()
    const content = String(composerContent || '').trim()
    if (!token) {
      setComposerNotice('Login is required to publish.')
      return
    }
    if (!content) {
      setComposerNotice('Post text is required.')
      return
    }

    setComposerBusy(true)
    setComposerNotice('')
    try {
      const response = await fetch(`${API}/api/admin/blog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content,
          imageData: composerImageData
        })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Failed to publish post.'))
      }

      const payload = await response.json()
      const createdPost = payload?.post || null
      if (!createdPost) {
        throw new Error('Publish succeeded but returned no post payload.')
      }

      setProfile((current) => {
        const next = current && typeof current === 'object' ? { ...current } : {}
        const existing = Array.isArray(next.blogPosts) ? next.blogPosts : []
        next.blogPosts = [createdPost, ...existing]
        return next
      })
      setComposerContent('')
      setComposerImageData('')
      setComposerNotice('Post published.')
    } catch (publishError) {
      setComposerNotice(publishError.message || 'Failed to publish post.')
    } finally {
      setComposerBusy(false)
    }
  }

  const handleCreateMission = async (event) => {
    event.preventDefault()
    const token = String(adminToken || '').trim()
    if (!token) {
      setMissionNotice('Admin login is required.')
      return
    }
    const title = String(missionForm.title || '').trim()
    if (!title) {
      setMissionNotice('Mission title is required.')
      return
    }

    setMissionBusy(true)
    setMissionNotice('')
    try {
      const response = await fetch(`${API}/api/admin/mission-control/mission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          description: missionForm.description,
          type: missionForm.type,
          priority: missionForm.priority,
          dueDate: missionForm.dueDate || '',
          moduleCode: missionForm.moduleCode || '',
          completed: false
        })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Failed to create mission.'))
      }
      const payload = await response.json()
      if (payload?.data) {
        setMissionControl(payload.data)
      } else {
        await loadMissionControl(token)
      }
      setMissionForm({
        title: '',
        description: '',
        type: 'daily',
        priority: 'medium',
        dueDate: '',
        moduleCode: ''
      })
      setMissionNotice('Mission created.')
    } catch (createError) {
      setMissionNotice(createError.message || 'Failed to create mission.')
    } finally {
      setMissionBusy(false)
    }
  }

  const handleToggleMission = async (mission, completed) => {
    const token = String(adminToken || '').trim()
    if (!token || !mission?.id) {
      return
    }
    setMissionBusy(true)
    setMissionNotice('')
    try {
      const response = await fetch(`${API}/api/admin/mission-control/mission/${encodeURIComponent(mission.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: mission.title,
          description: mission.description || '',
          type: mission.type || 'daily',
          priority: mission.priority || 'medium',
          dueDate: mission.dueDate || '',
          moduleCode: mission.moduleCode || '',
          completed
        })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Failed to update mission.'))
      }
      const payload = await response.json()
      if (payload?.data) {
        setMissionControl(payload.data)
      } else {
        await loadMissionControl(token)
      }
    } catch (updateError) {
      setMissionNotice(updateError.message || 'Failed to update mission.')
    } finally {
      setMissionBusy(false)
    }
  }

  const handleDeleteMission = async (missionId) => {
    const token = String(adminToken || '').trim()
    if (!token || !missionId) {
      return
    }
    setMissionBusy(true)
    setMissionNotice('')
    try {
      const response = await fetch(`${API}/api/admin/mission-control/mission/${encodeURIComponent(missionId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Failed to delete mission.'))
      }
      const payload = await response.json()
      if (payload?.data) {
        setMissionControl(payload.data)
      } else {
        await loadMissionControl(token)
      }
      setMissionNotice('Mission removed.')
    } catch (deleteError) {
      setMissionNotice(deleteError.message || 'Failed to delete mission.')
    } finally {
      setMissionBusy(false)
    }
  }

  const handleModuleDraftValue = (moduleCode, key, value) => {
    setModuleDrafts((current) => {
      const next = { ...current }
      const moduleDraft = next[moduleCode] || { marks: {}, examMark: '' }
      const marks = { ...(moduleDraft.marks || {}) }
      marks[key] = value
      next[moduleCode] = { ...moduleDraft, marks }
      return next
    })
  }

  const handleModuleExamDraft = (moduleCode, value) => {
    setModuleDrafts((current) => {
      const next = { ...current }
      const moduleDraft = next[moduleCode] || { marks: {}, examMark: '' }
      next[moduleCode] = { ...moduleDraft, examMark: value }
      return next
    })
  }

  const handleSaveModuleProgress = async (moduleCode) => {
    const token = String(adminToken || '').trim()
    if (!token || !moduleCode) {
      return
    }

    const draft = moduleDrafts[moduleCode] || { marks: {}, examMark: '' }
    const marks = {}
    for (const [key, rawValue] of Object.entries(draft.marks || {})) {
      const text = String(rawValue ?? '').trim()
      if (!text) {
        continue
      }
      const value = Number(text)
      if (!Number.isFinite(value)) {
        setMissionNotice(`Invalid mark value for ${key}.`)
        return
      }
      marks[key] = value
    }

    let examMark = null
    const examText = String(draft.examMark ?? '').trim()
    if (examText) {
      const parsed = Number(examText)
      if (!Number.isFinite(parsed)) {
        setMissionNotice('Invalid exam mark value.')
        return
      }
      examMark = parsed
    }

    setMissionBusy(true)
    setMissionNotice('')
    try {
      const response = await fetch(`${API}/api/admin/mission-control/module/${encodeURIComponent(moduleCode)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ marks, examMark })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Failed to save module progress.'))
      }
      const payload = await response.json()
      if (payload?.data) {
        setMissionControl(payload.data)
      } else {
        await loadMissionControl(token)
      }
      setMissionNotice(`${moduleCode} marks saved.`)
    } catch (saveError) {
      setMissionNotice(saveError.message || 'Failed to save module progress.')
    } finally {
      setMissionBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const token = String(adminToken || '').trim()
    if (!token) {
      setAdminChecking(false)
      return () => {
        cancelled = true
      }
    }

    const verifySession = async () => {
      setAdminChecking(true)
      try {
        const response = await fetch(`${API}/api/admin/session`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!response.ok) {
          throw new Error('Session expired. Please login again.')
        }
        const payload = await response.json()
        if (cancelled) {
          return
        }
        setAdminUsername(String(payload?.username || 'admin'))
        if (route === 'missions') {
          await loadMissionControl(token)
        }
      } catch (sessionError) {
        if (cancelled) {
          return
        }
        setAdminToken('')
        persistAdminToken('')
        setAdminNotice(sessionError.message || 'Session expired.')
      } finally {
        if (!cancelled) {
          setAdminChecking(false)
        }
      }
    }

    verifySession()
    return () => {
      cancelled = true
    }
  }, [adminToken, route])

  useEffect(() => {
    const syncRoute = () => {
      setRoute(parseRouteFromHash())
      setMenuOpen(false)
    }

    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  useEffect(() => {
    if (route === 'cv') {
      return
    }
    load()
  }, [route])

  useEffect(() => {
    if (route !== 'missions') {
      return
    }
    if (!adminToken || adminChecking) {
      return
    }
    loadMissionControl()
  }, [route, adminToken, adminChecking])

  useEffect(() => {
    if (!missionModules.length) {
      return
    }
    setModuleDrafts((current) => {
      const next = { ...current }
      for (const module of missionModules) {
        const code = module?.definition?.code
        if (!code) {
          continue
        }
        const marks = {}
        for (const component of module?.definition?.components || []) {
          const key = component?.key
          if (!key) {
            continue
          }
          const raw = module?.progress?.marks?.[key]
          marks[key] = Number.isFinite(Number(raw)) ? String(raw) : ''
        }
        const rawExam = module?.progress?.examMark
        next[code] = {
          marks,
          examMark: Number.isFinite(Number(rawExam)) ? String(rawExam) : ''
        }
      }
      return next
    })
  }, [missionControl])

  const navigateTo = (nextRoute) => {
    const nextHash = routeHash(nextRoute)
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    } else {
      setRoute(nextRoute)
    }
    setMenuOpen(false)
  }

  const projects = useMemo(() => {
    const curated = FEATURED_PROJECTS.map((project) => {
      const key = normalizeProjectKey(project.name)
      const overrideLanguages = PROJECT_LANGUAGE_OVERRIDES[key]
      const languages = Array.isArray(project.languages) && project.languages.length
        ? project.languages
        : overrideLanguages

      return {
        ...project,
        language: project.language || (languages?.[0] || 'Unknown'),
        languages,
        image: projectImageFor(project.name, project.image)
      }
    })
    const seenUrls = new Set(curated.map((project) => (project.url || '').toLowerCase()))
    const seenNames = new Set(curated.map((project) => project.name.toLowerCase()))

    const repoProjects = repos
      .filter((repo) => !HIDDEN_PROJECT_KEYS.has(normalizeProjectKey(repo.name)))
      .map((repo) => {
        const key = normalizeProjectKey(repo.name)
        const overrideLanguages = PROJECT_LANGUAGE_OVERRIDES[key]
        const languages = Array.isArray(overrideLanguages) && overrideLanguages.length
          ? overrideLanguages
          : (repo.language ? [repo.language] : undefined)

        return {
          name: repo.name,
          description: repo.description || 'No description available yet.',
          url: repo.url,
          language: languages?.[0] || repo.language || 'Unknown',
          languages,
          pushedAt: repo.pushedAt,
          image: projectImageFor(repo.name)
        }
      })
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

  useEffect(() => {
    projectRefs.current[selectedProject]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    })
  }, [selectedProject])

  const selected = projects[selectedProject] || projects[0]
  const selectedLanguages = useMemo(() => projectLanguagesFor(selected), [selected])

  const thmData = useMemo(() => unwrapTryHackMe(thmResponse), [thmResponse])
  const thmDisabled = Boolean(thmData?.__disabled)
  const thmProfile = useMemo(() => extractTHMProfileNode(thmData), [thmData])
  const thmUsername = useMemo(() => extractTHMUsername(thmProfile), [thmProfile])
  const thmTitleTag = useMemo(() => extractTHMTitleTag(thmProfile), [thmProfile])
  const thmLevel = useMemo(() => extractTHMLevel(thmProfile), [thmProfile])
  const thmPoints = useMemo(() => extractTHMPoints(thmProfile), [thmProfile])
  const thmAvatar = useMemo(() => extractTHMAvatar(thmProfile), [thmProfile])
  const thmRank = useMemo(() => extractRank(thmData), [thmData])
  const thmRooms = useMemo(() => extractRooms(thmData), [thmData])
  const thmRoomCount = useMemo(() => extractRoomCount(thmData), [thmData])
  const thmSkills = useMemo(() => extractSkills(thmData), [thmData])
  const thmSkillMatrix = useMemo(() => buildTHMSkillMatrix(thmSkills), [thmSkills])
  const thmSkillsError = thmData?.skillsError || ''
  const thmRoomsError = thmData?.completedRoomsError || ''
  const thmHexTag = useMemo(() => {
    if (thmLevel === null || thmLevel === undefined) {
      return ''
    }
    return `0x${Number(thmLevel).toString(16).toUpperCase()}`
  }, [thmLevel])
  const thmTagLine = useMemo(() => {
    const tags = []
    if (thmHexTag) {
      tags.push(`[${thmHexTag}]`)
    }
    if (thmTitleTag) {
      tags.push(`[${thmTitleTag}]`)
    }
    return tags.join('')
  }, [thmHexTag, thmTitleTag])
  const thmArcana = thmTitleTag || 'SEEKER'

  const languages = profile?.languages || []
  const experiences = profile?.experience || []
  const certifications = profile?.certifications || []
  const blogPosts = Array.isArray(profile?.blogPosts) ? profile.blogPosts : []
  const linkedInUrl = profile?.linkedinUrl || LINKEDIN_FALLBACK
  const isAdminAuthenticated = Boolean(adminToken) && !adminChecking
  const blogFeed = useMemo(
    () => blogPosts
      .map((post, index) => normalizeBlogPost(post, index))
      .filter((post) => post.title || post.content || post.imageData || post.link),
    [blogPosts]
  )
  const missionItems = Array.isArray(missionControl?.missions) ? missionControl.missions : []
  const missionModules = Array.isArray(missionControl?.modules) ? missionControl.modules : []
  const missionModuleCodes = missionModules.map((module) => module?.definition?.code).filter(Boolean)
  const todayMissionDate = missionControl?.today || normalizeDateOnly(new Date())
  const dailyMissions = useMemo(
    () => missionItems.filter((mission) => !mission.completed && (
      mission.type === 'daily' || normalizeDateOnly(mission.dueDate) === todayMissionDate
    )),
    [missionItems, todayMissionDate]
  )
  const upcomingMissions = useMemo(
    () => missionItems.filter((mission) => !mission.completed),
    [missionItems]
  )
  const missionWeeks = useMemo(
    () => buildCalendarGrid(calendarCursor, missionItems),
    [calendarCursor, missionItems]
  )
  const calendarHeading = calendarCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  if (route !== 'cv' && loading && !profile) {
    return <div className="loading">Loading Persona interface...</div>
  }

  return (
    <div className="app">
      <div className="backdrop-pattern" aria-hidden="true" />

      <button
        type="button"
        className={`menu-overlay ${menuOpen ? 'is-open' : ''}`}
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />

      <div className="menu-shell">
        <button
          type="button"
          className={`menu-toggle ${menuOpen ? 'is-open' : ''}`}
          aria-label="Open site menu"
          aria-controls="site-menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id="site-menu" className={`menu-drawer ${menuOpen ? 'is-open' : ''}`} aria-label="Site sections">
          <button
            type="button"
            className={`menu-link ${route === 'home' ? 'is-active' : ''}`}
            onClick={() => navigateTo('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={`menu-link ${route === 'cv' ? 'is-active' : ''}`}
            onClick={() => navigateTo('cv')}
          >
            View CV
          </button>
          <button
            type="button"
            className={`menu-link ${route === 'blog' ? 'is-active' : ''}`}
            onClick={() => navigateTo('blog')}
          >
            Blog Posts
          </button>
          {isAdminAuthenticated && (
            <button
              type="button"
              className={`menu-link ${route === 'missions' ? 'is-active' : ''}`}
              onClick={() => navigateTo('missions')}
            >
              Mission Control
            </button>
          )}

          <section className="menu-admin">
            <p className="menu-admin-title">Admin Access</p>

            {isAdminAuthenticated ? (
              <>
                <p className="menu-admin-status">Signed in as {adminUsername}</p>
                <button
                  type="button"
                  className="menu-link"
                  onClick={() => navigateTo('blog')}
                >
                  Write Post
                </button>
                <button
                  type="button"
                  className="menu-link"
                  onClick={() => navigateTo('missions')}
                >
                  Mission Control
                </button>
                <button
                  type="button"
                  className="menu-link menu-link-danger"
                  onClick={handleAdminLogout}
                >
                  Log Out
                </button>
              </>
            ) : (
              <form className="menu-admin-form" onSubmit={handleAdminLogin}>
                <input
                  className="menu-admin-input"
                  type="text"
                  placeholder="Admin username"
                  autoComplete="username"
                  value={loginForm.username}
                  onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                />
                <input
                  className="menu-admin-input"
                  type="password"
                  placeholder="Admin password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                />
                <button type="submit" className="menu-link" disabled={adminChecking}>
                  {adminChecking ? 'Signing In...' : 'Admin Login'}
                </button>
              </form>
            )}

            {adminNotice && <p className="menu-admin-note">{adminNotice}</p>}
          </section>
        </nav>
      </div>

      {route === 'home' ? (
        <>
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
                <div className="profile-links">
                  <a href={linkedInUrl} target="_blank" rel="noreferrer">LinkedIn Profile</a>
                </div>
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
                  disabled={projects.length <= 1}
                  onClick={() => setSelectedProject((prev) => (prev - 1 + projects.length) % projects.length)}
                >
                  &#10094;
                </button>

                <div className="projects-carousel" ref={carouselRef}>
                  {projects.map((project, index) => (
                    <button
                      key={`${project.name}-${index}`}
                      ref={(node) => {
                        projectRefs.current[index] = node
                      }}
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
                  disabled={projects.length <= 1}
                  onClick={() => setSelectedProject((prev) => (prev + 1) % projects.length)}
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
                    <div className="meta-languages">
                      <span className="meta-label">Languages:</span>
                      <div className="project-language-list">
                        {selectedLanguages.length ? selectedLanguages.map((language) => (
                          <span key={language} className="project-language-chip">
                            <span className="project-language-icon" aria-hidden="true">
                              <LanguageIcon language={language} />
                            </span>
                            <span>{language}</span>
                          </span>
                        )) : <span className="meta-empty">Unknown</span>}
                      </div>
                    </div>
                    <span className="meta-updated">Updated: {formatDate(selected.pushedAt)}</span>
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
                  <div className="thm-persona-card" aria-label="TryHackMe identity card">
                    <div className="thm-persona-avatar">
                      {thmAvatar ? (
                        <img src={thmAvatar} alt={`${thmUsername || 'TryHackMe'} avatar`} loading="lazy" />
                      ) : (
                        <div className="thm-persona-avatar-fallback">{(thmUsername || 'T').slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="thm-persona-main">
                      <p className="thm-persona-ribbon">TryHackMe Profile</p>
                      <p className="thm-persona-headline">
                        <span className="thm-persona-name">{thmUsername || 'Unknown Operative'}</span>
                        {thmTagLine && <span className="thm-persona-tags">{thmTagLine}</span>}
                      </p>
                      <div className="thm-persona-stats">
                        <span className="thm-persona-stat"><strong>Points</strong>{formatNumber(thmPoints ?? 'Unknown')}</span>
                        <span className="thm-persona-stat"><strong>Rank</strong>{formatNumber(thmRank || 'Unknown')}</span>
                        <span className="thm-persona-stat"><strong>Level</strong>{thmLevel ?? 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="thm-persona-rankbox">
                      <span>Arcana</span>
                      <strong>{thmArcana}</strong>
                    </div>
                  </div>

                  <div className="thm-star-card">
                    <SkillRadar skills={thmSkills} />
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
                      <p className="stat-value">{thmSkillMatrix.length}</p>
                    </div>
                  </div>

                  <div className="thm-skills-card">
                    <h3>Skills Matrix</h3>
                    <div className="skill-list">
                      {thmSkillMatrix.map((skill) => (
                        <div className="skill-item" key={skill.name}>
                          <strong>{skill.name}</strong>
                          <span>{`${Math.round(skill.value)}/100`}</span>
                          <div className="skill-bar"><span style={{ width: `${normalizeSkillValue(skill.value)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                    {!thmSkills.length && (
                      <p className="empty-note">No canonical skills were found in the current TryHackMe payload.</p>
                    )}
                  </div>

                  <div className="thm-rooms-card">
                    <h3>Completed Rooms</h3>
                    {thmRooms.length ? (
                      <ul>
                        {thmRooms.map((room) => <li key={room}>{room}</li>)}
                      </ul>
                    ) : (
                      <p className="empty-note">No room names were returned by the current TryHackMe payload. Count is still shown above.</p>
                    )}
                    {thmRoomCount && thmRooms.length > 0 && thmRoomCount > thmRooms.length && (
                      <p className="empty-note">Showing {thmRooms.length} of {thmRoomCount} completed rooms.</p>
                    )}
                  </div>

                  {thmSkillsError && (
                    <div className="thm-rooms-card">
                      <h3>Skills Sync Note</h3>
                      <p className="empty-note">{thmSkillsError}</p>
                    </div>
                  )}

                  {thmRoomsError && (
                    <div className="thm-rooms-card">
                      <h3>Rooms Sync Note</h3>
                      <p className="empty-note">{thmRoomsError}</p>
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
                    {languages.map((lang) => (
                      <span key={lang} className="tag tag-language">
                        <span className="tag-icon" aria-hidden="true">
                          <LanguageIcon language={lang} />
                        </span>
                        <span>{lang}</span>
                      </span>
                    ))}
                  </div>
                </article>

                <article className="mini-panel">
                  <h3>Experience</h3>
                  {experiences.map((exp) => (
                    <div key={`${exp.company}-${exp.role}`} className="stack-item">
                      <strong>{exp.role}</strong>
                      <p>{exp.company} · {exp.dateRange}</p>
                      {Array.isArray(exp.description) && exp.description.length > 0 && (
                        <ul className="stack-points">
                          {exp.description.map((point, idx) => <li key={`${exp.role}-point-${idx}`}>{point}</li>)}
                        </ul>
                      )}
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
        </>
      ) : route === 'cv' ? (
        <main className="shell cv-page" id="cv-view">
          <section className="panel cv-panel">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Curriculum Vitae</h2>
            </div>
            <p className="section-lead">Previewing your CV in-browser. Use the browser controls to zoom or download.</p>
            <div className="cv-viewer-frame">
              <iframe className="cv-viewer" title="Shayden Naidoo CV" src={CV_PDF} />
            </div>
            <a className="cv-open-link" href={CV_PDF} target="_blank" rel="noreferrer">Open CV in a new tab</a>
          </section>
        </main>
      ) : route === 'blog' ? (
        <main className="shell blog-page" id="blog-view">
          <section className="panel blog-panel">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Blog Posts</h2>
            </div>
            <p className="section-lead">Micro-post feed for weekly updates. Admin publishing is available from the burger-menu login.</p>

            {isAdminAuthenticated && (
              <section className="blog-composer">
                <p className="label-chip">Admin Composer</p>
                <form className="blog-composer-form" onSubmit={handleCreateBlogPost}>
                  <textarea
                    className="blog-textarea"
                    value={composerContent}
                    onChange={(event) => setComposerContent(event.target.value)}
                    placeholder="Write a new post update..."
                    rows={4}
                    maxLength={1000}
                  />

                  <div className="blog-composer-controls">
                    <label className="blog-upload-button">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleComposerImageChange}
                      />
                      Upload Image
                    </label>
                    <button type="submit" className="blog-publish-btn" disabled={composerBusy}>
                      {composerBusy ? 'Publishing...' : 'Publish Post'}
                    </button>
                  </div>
                </form>

                {composerImageData && (
                  <div className="blog-image-preview">
                    <img src={composerImageData} alt="Selected blog upload preview" />
                  </div>
                )}

                {composerNotice && (
                  <p className="blog-composer-note">{composerNotice}</p>
                )}
              </section>
            )}

            {blogFeed.length ? (
              <div className="blog-feed">
                {blogFeed.map((post) => (
                  <article className="blog-post-card" key={post.id}>
                    <header className="blog-post-header">
                      <strong>{profile?.displayName || 'Shayden Naidoo'}</strong>
                      <span>@{(profile?.displayName || 'admin').toLowerCase().replace(/\s+/g, '')}</span>
                      <time>{post.dateLabel}</time>
                    </header>

                    {post.title && <h3>{post.title}</h3>}
                    {post.content && <p className="blog-post-content">{post.content}</p>}

                    {post.imageData && (
                      <div className="blog-post-image">
                        <img src={post.imageData} alt="Blog post upload" loading="lazy" />
                      </div>
                    )}

                    {post.link && (
                      <a className="blog-link" href={post.link} target="_blank" rel="noreferrer">
                        Open Link
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">No posts published yet. Login via the burger menu to publish your first update.</p>
            )}

            <a className="cv-open-link" href={linkedInUrl} target="_blank" rel="noreferrer">Follow on LinkedIn</a>
          </section>
        </main>
      ) : (
        <main className="shell mission-page" id="mission-view">
          <section className="panel mission-panel">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Mission Control</h2>
            </div>

            {!isAdminAuthenticated ? (
              <p className="empty-note">Admin login is required to access Mission Control. Use the burger menu to sign in.</p>
            ) : (
              <>
                <p className="section-lead">Track daily missions, due dates, and module marks using your Persona-style planner.</p>
                {missionError && <p className="mission-note mission-note-error">{missionError}</p>}
                {missionNotice && <p className="mission-note mission-note-info">{missionNotice}</p>}

                {missionLoading && !missionControl ? (
                  <p className="empty-note">Loading Mission Control data...</p>
                ) : (
                  <div className="mission-layout">
                    <div className="mission-column">
                      <section className="mission-card">
                        <h3>Create Mission</h3>
                        <form className="mission-form" onSubmit={handleCreateMission}>
                          <input
                            type="text"
                            className="mission-input"
                            placeholder="Mission title"
                            value={missionForm.title}
                            maxLength={140}
                            onChange={(event) => setMissionForm((current) => ({ ...current, title: event.target.value }))}
                          />
                          <textarea
                            className="mission-textarea"
                            rows={3}
                            maxLength={500}
                            placeholder="Description (optional)"
                            value={missionForm.description}
                            onChange={(event) => setMissionForm((current) => ({ ...current, description: event.target.value }))}
                          />
                          <div className="mission-form-row">
                            <label>
                              Type
                              <select
                                className="mission-select"
                                value={missionForm.type}
                                onChange={(event) => setMissionForm((current) => ({ ...current, type: event.target.value }))}
                              >
                                {MISSION_TYPES.map((type) => (
                                  <option value={type} key={type}>{formatMissionType(type)}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Priority
                              <select
                                className="mission-select"
                                value={missionForm.priority}
                                onChange={(event) => setMissionForm((current) => ({ ...current, priority: event.target.value }))}
                              >
                                {MISSION_PRIORITIES.map((priority) => (
                                  <option value={priority} key={priority}>{formatMissionPriority(priority)}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="mission-form-row">
                            <label>
                              Due Date
                              <input
                                type="date"
                                className="mission-input"
                                value={missionForm.dueDate}
                                onChange={(event) => setMissionForm((current) => ({ ...current, dueDate: event.target.value }))}
                              />
                            </label>
                            <label>
                              Module
                              <select
                                className="mission-select"
                                value={missionForm.moduleCode}
                                onChange={(event) => setMissionForm((current) => ({ ...current, moduleCode: event.target.value }))}
                              >
                                <option value="">General</option>
                                {missionModuleCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                              </select>
                            </label>
                          </div>
                          <button type="submit" className="blog-publish-btn" disabled={missionBusy}>
                            {missionBusy ? 'Saving...' : 'Add Mission'}
                          </button>
                        </form>
                      </section>

                      <section className="mission-card">
                        <h3>Daily Missions</h3>
                        {dailyMissions.length ? (
                          <ul className="mission-list">
                            {dailyMissions.map((mission) => (
                              <li key={mission.id} className="mission-item">
                                <label className="mission-check">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(mission.completed)}
                                    onChange={(event) => handleToggleMission(mission, event.target.checked)}
                                  />
                                  <span>{mission.title}</span>
                                </label>
                                <span className={`mission-priority mission-priority-${mission.priority || 'medium'}`}>
                                  {formatMissionPriority(mission.priority)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-note">No active daily missions.</p>
                        )}
                      </section>

                      <section className="mission-card">
                        <h3>Upcoming Deadlines</h3>
                        {upcomingMissions.length ? (
                          <ul className="mission-list">
                            {upcomingMissions.map((mission) => (
                              <li key={mission.id} className="mission-item mission-item-detailed">
                                <div>
                                  <label className="mission-check">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(mission.completed)}
                                      onChange={(event) => handleToggleMission(mission, event.target.checked)}
                                    />
                                    <span>{mission.title}</span>
                                  </label>
                                  <p className="mission-meta">
                                    {formatMissionType(mission.type)} · {formatDateShort(mission.dueDate)}{mission.moduleCode ? ` · ${mission.moduleCode}` : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="mission-delete"
                                  onClick={() => handleDeleteMission(mission.id)}
                                  aria-label={`Delete ${mission.title}`}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-note">No upcoming missions right now.</p>
                        )}
                      </section>
                    </div>

                    <div className="mission-column mission-column-wide">
                      <section className="mission-card">
                        <div className="mission-calendar-head">
                          <h3>Calendar</h3>
                          <div className="mission-calendar-nav">
                            <button
                              type="button"
                              className="menu-link"
                              onClick={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                            >
                              Prev
                            </button>
                            <strong>{calendarHeading}</strong>
                            <button
                              type="button"
                              className="menu-link"
                              onClick={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                        <div className="mission-calendar-grid" role="table" aria-label="Mission calendar">
                          {WEEKDAY_LABELS.map((label) => (
                            <div key={label} className="mission-calendar-weekday">{label}</div>
                          ))}
                          {missionWeeks.flat().map((cell) => (
                            <div
                              key={cell.key}
                              className={`mission-calendar-cell ${cell.day ? '' : 'is-empty'} ${cell.date === todayMissionDate ? 'is-today' : ''}`}
                            >
                              {cell.day && (
                                <>
                                  <span className="mission-calendar-day">{cell.day}</span>
                                  {cell.missions.slice(0, 2).map((mission) => (
                                    <span key={mission.id} className={`mission-calendar-pill mission-pill-${mission.priority || 'medium'}`}>
                                      {mission.title}
                                    </span>
                                  ))}
                                  {cell.missions.length > 2 && (
                                    <span className="mission-calendar-pill mission-calendar-pill-more">+{cell.missions.length - 2}</span>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="mission-card">
                        <h3>Academic Progress</h3>
                        <div className="module-list">
                          {missionModules.map((module) => {
                            const code = module?.definition?.code || 'MODULE'
                            const draft = moduleDrafts[code] || { marks: {}, examMark: '' }
                            return (
                              <article className="module-card" key={code}>
                                <header className="module-card-head">
                                  <div>
                                    <h4>{code} · {module?.definition?.name || 'Module'}</h4>
                                    <p>{module?.definition?.source || ''}</p>
                                  </div>
                                  <button
                                    type="button"
                                    className="blog-publish-btn"
                                    disabled={missionBusy}
                                    onClick={() => handleSaveModuleProgress(code)}
                                  >
                                    Save
                                  </button>
                                </header>

                                <div className="module-metrics">
                                  <span><strong>Semester Mark:</strong> {formatPercent(module?.metrics?.semesterMark)}</span>
                                  <span><strong>Coverage:</strong> {formatPercent(module?.metrics?.semesterCoverage)}</span>
                                  <span><strong>Final Mark:</strong> {module?.metrics?.finalMark == null ? 'Pending exam mark' : formatPercent(module?.metrics?.finalMark)}</span>
                                  <span><strong>Exam Needed for 50%:</strong> {module?.metrics?.requiredExamForPass == null ? 'N/A' : formatPercent(module?.metrics?.requiredExamForPass)}</span>
                                </div>

                                <div className="module-input-grid">
                                  {(module?.definition?.components || []).map((component) => (
                                    <label key={component.key} className="module-input-row">
                                      <span>{component.label} ({formatPercent(component.weight)})</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={draft?.marks?.[component.key] ?? ''}
                                        onChange={(event) => handleModuleDraftValue(code, component.key, event.target.value)}
                                        className="mission-input"
                                      />
                                    </label>
                                  ))}
                                  <label className="module-input-row">
                                    <span>Exam Mark</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={draft?.examMark ?? ''}
                                      onChange={(event) => handleModuleExamDraft(code, event.target.value)}
                                      className="mission-input"
                                    />
                                  </label>
                                </div>

                                {(module?.definition?.rules || []).length > 0 && (
                                  <div className="module-rules">
                                    {module.definition.rules.map((rule) => <p key={`${code}-${rule}`}>{rule}</p>)}
                                  </div>
                                )}
                              </article>
                            )
                          })}
                        </div>
                      </section>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      )}

      <footer className="site-footer">
        <p>&copy; 2026 Shayden Naidoo. All rights reserved.</p>
        <p className="font-credit">Font attribution: <a href="http://www.onlinewebfonts.com" target="_blank" rel="noreferrer">Web Fonts</a></p>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
