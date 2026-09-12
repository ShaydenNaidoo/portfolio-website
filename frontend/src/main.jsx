import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8080'
const ADMIN_TOKEN_STORAGE_KEY = 'portfolio_admin_token'
const PROJECT_IMAGE = '/assets/project-fallback.jpeg'
const GREEN_CART_IMAGE = '/assets/project-art/COS301.jpg'
const PROJECT_ART_BASE = '/assets/project-art'
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
  'shaydennaidoo',
  'cos221-project'
])

const PROJECT_URL_OVERRIDES = {
  cos221project: 'https://github.com/nikhilpg12/COS221PROJECT'
}

const PROJECT_DESCRIPTION_OVERRIDES = {
  cos221project: 'made for our database management module COS 221 at the university of pretoria, Hoop is a modern streaming website that allows users to manage movies and series, including functionalities for adding, editing, and deleting entries, as well as user and admin management. The website includes search functionality and user recommendations.'
}

const PROJECT_LANGUAGE_OVERRIDES = {
  'green-cart': ['JavaScript', 'Python', 'CSS'],
  'vscoders-and-the-jetbrainstormers-team-4': ['C++', 'HTML', 'JavaScript', 'CSS'],
  cos221project: ['PHP', 'CSS', 'JavaScript'],
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

const SCREENS = ['home', 'projects', 'skills', 'about', 'cv', 'blog', 'contact', 'missions']
const MENU_ITEMS = [
  { id: 'projects', label: 'PROJECTS' },
  { id: 'skills', label: 'SKILLS' },
  { id: 'about', label: 'ABOUT' },
  { id: 'blog', label: 'BLOG' },
  { id: 'contact', label: 'CONTACT' }
]
const ADMIN_MENU_ITEM = { id: 'missions', label: 'MISSIONS' }

const parseRouteFromHash = () => {
  const normalized = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  return SCREENS.includes(normalized) ? normalized : 'home'
}

const routeHash = (route) => (route === 'home' ? '#/' : `#/${route}`)

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

const extractRank = (data) => pickDeep(data, (key, value) => /(global.?rank|world.?rank|user.?rank|^rank$|ranking)/i.test(key) && (typeof value === 'number' || typeof value === 'string'))

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
          <text x="10" y="12.7" textAnchor="middle" fontSize="7.1" fontWeight="700" fill="#e60012">{'</>'}</text>
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
    <svg viewBox="-70 -14 560 448" aria-label="TryHackMe skills radar chart" role="img" className="thm-radar-svg">
      {Array.from({ length: rings }, (_, ringIndex) => ringIndex + 1).map((ring) => (
        <polygon
          key={`ring-${ring}`}
          points={ringPoints(ring / rings)}
          fill="none"
          stroke={ring === rings ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'}
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
            stroke="rgba(255,255,255,0.22)"
            strokeDasharray="4 5"
            strokeWidth="1"
          />
        )
      })}

      <polygon
        points={graphPoints.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="rgba(230,0,18,0.55)"
        stroke="#f6f4ef"
        strokeWidth="2.8"
      />

      {graphPoints.map((point, index) => (
        <circle
          key={`node-${orderedSkills[index].name}`}
          cx={point.x}
          cy={point.y}
          r="3.4"
          fill="#e60012"
          stroke="#f6f4ef"
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


/* =====================================================================
   Persona-5 menu UI helpers: ransom lettering, ambient hooks, cards
   ===================================================================== */

const GITHUB_FALLBACK = 'https://github.com/ShaydenNaidoo'
const CONTACT_EMAIL = '' // set to enable the "send me a message" relay form (formsubmit.co)
const SELECT_SFX = '/assets/sfx/select.mp3'
const MENU_ART = {
  home: '/assets/menus/home.jpg',
  projects: '/assets/menus/projects.jpg',
  skills: '/assets/menus/skills.jpg',
  about: '/assets/menus/about.jpg',
  contact: '/assets/menus/contact.jpg'
}
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8',
  PHP: '#4F5D95', CSS: '#663399', HTML: '#e34c26', Shell: '#89e051', Bash: '#89e051',
  'Jupyter Notebook': '#DA5B0B', Java: '#b07219', C: '#555', 'C++': '#f34b7d',
  Assembly: '#6E4C13', Pascal: '#E3F171', Prolog: '#74283c', Scheme: '#1e4aec', SQL: '#e38c00'
}

// Deterministic pseudo-random hash (so letters look the same every visit)
const hashString = (str) => {
  let h = 9
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 387420489)
  }
  return (h ^ (h >>> 9)) >>> 0
}

const tiltFor = (name) => `${((hashString(String(name)) % 5) - 2) * 0.8}deg`

// Split "Green Cart" so the first word renders red
const splitTitle = (title) => {
  const text = String(title || '')
  const first = text.split(' ')[0]
  return (
    <>
      <em>{first}</em>{text.slice(first.length)}
    </>
  )
}

const shortNote = (text, max = 160) => {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

const prettyName = (name) => String(name || '')
  .replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase())

const useReducedMotion = () => useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

function Ransom({ text, className = '' }) {
  const letters = useMemo(() => [...String(text || '')].map((c, i) => {
    const h = hashString(text + i)
    const rot = (h % 17) - 8
    const scale = 0.86 + ((h >> 3) % 30) / 100
    const dy = ((h >> 5) % 9) - 4
    const variant = (h >> 7) % 10
    const cls = variant === 0 ? ' box' : variant === 1 ? ' boxw' : variant === 2 ? ' red' : ''
    return { c: c === ' ' ? ' ' : c, t: `rotate(${rot}deg) scale(${scale}) translateY(${dy}px)`, cls, key: i }
  }), [text])

  return (
    <span className={`ransom ${className}`.trim()}>
      {letters.map((l) => (
        <span key={l.key} className={`ch display${l.cls}`} style={{ '--t': l.t, transform: l.t }}>{l.c}</span>
      ))}
    </span>
  )
}

function Thumb({ src, alt = '' }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return null
  }
  return (
    <div className="thumb">
      <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
    </div>
  )
}

function ProjectCard({ project, index, featured }) {
  const languages = projectLanguagesFor(project)
  const primary = languages[0] || project.language || 'Repo'
  return (
    <a
      className={`card${featured ? ' feat' : ''}`}
      href={project.url || '#'}
      target="_blank"
      rel="noreferrer"
      style={{ '--tilt': tiltFor(project.name), '--d': `${index * 70}ms`, '--lc': LANG_COLORS[primary] || '#e60012' }}
    >
      <Thumb src={project.image} />
      <span className="lang">{primary}</span>
      <h3>{splitTitle(prettyName(project.name))}</h3>
      <p>{project.description}</p>
      {languages.length > 1 && (
        <div className="langs">
          {languages.map((language) => (
            <span key={language}><LanguageIcon language={language} />{language}</span>
          ))}
        </div>
      )}
      <div className="meta">
        <span>{featured ? 'HIGHLIGHT' : project.pushedAt ? `Updated ${formatDate(project.pushedAt)}` : `★ ${project.stars || 0}`}</span>
        <span className="go">View on GitHub →</span>
      </div>
    </a>
  )
}

// Per-screen art at /assets/menus/<screen>.<ext>; tries jpg, jpeg then png.
const MENU_ART_EXTENSIONS = ['jpg', 'jpeg', 'png']

function MenuArt({ id, src, onReady }) {
  const [attempt, setAttempt] = useState(0)
  if (attempt >= MENU_ART_EXTENSIONS.length) {
    return null
  }
  const base = src.replace(/\.[a-z0-9]+$/i, '')
  return (
    <img
      className="menu-art"
      id={`art-${id}`}
      src={`${base}.${MENU_ART_EXTENSIONS[attempt]}`}
      alt=""
      onLoad={() => onReady(id)}
      onError={() => setAttempt((current) => current + 1)}
    />
  )
}

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(`${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · PTA`)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

// Mouse parallax on the background layers, same easing as the reference
function useParallax(bgRef, reduced) {
  useEffect(() => {
    if (reduced || !bgRef.current) {
      return undefined
    }
    const stripes = bgRef.current.querySelector('#bg-stripes')
    const halftone = bgRef.current.querySelector('#bg-halftone')
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    let raf = 0
    const onMove = (e) => {
      tx = e.clientX / window.innerWidth - 0.5
      ty = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    const loop = () => {
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      stripes.style.transform = `translate(${cx * 22}px, ${cy * 14}px)`
      halftone.style.transform = `translate(${cx * -34}px, ${cy * -22}px)`
      bgRef.current?.querySelectorAll('.menu-art').forEach((a) => {
        a.style.transform = `translate(${cx * 14}px, ${cy * 9}px) scale(1.04)`
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
    }
  }, [bgRef, reduced])
}

// 30-frame sprite-strip cursor (50ms per frame, like the original .ani)
function useSpriteCursor(cursorRef, reduced) {
  useEffect(() => {
    if (!window.matchMedia('(pointer:fine)').matches || reduced || !cursorRef.current) {
      return undefined
    }
    const cur = cursorRef.current
    document.body.classList.add('cursor-on')
    let x = -100
    let y = -100
    let frame = 0
    let last = 0
    let visible = false
    let raf = 0

    const onMove = (e) => {
      x = e.clientX
      y = e.clientY
      if (!visible) {
        cur.style.display = 'block'
        visible = true
      }
      const overLink = e.target.closest?.('a,button,label,input,select,textarea,.card,.menu-item,.back-hint,.contact-chip,.chip,#big-name')
      cur.classList.toggle('link', Boolean(overLink))
    }
    const onLeave = () => {
      cur.style.display = 'none'
      visible = false
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)

    const tick = (ts) => {
      if (ts - last >= 50) {
        frame = (frame + 1) % 30
        last = ts
        cur.style.backgroundPosition = `${-frame * 48}px 0`
      }
      cur.style.transform = `translate(${x}px, ${y}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      document.body.classList.remove('cursor-on')
    }
  }, [cursorRef, reduced])
}

function App() {
  const [route, setRoute] = useState(() => parseRouteFromHash())
  const [menuIndex, setMenuIndex] = useState(0)
  const [artReady, setArtReady] = useState({})
  const [barsOn, setBarsOn] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [contactStatus, setContactStatus] = useState('')
  const [contactBusy, setContactBusy] = useState(false)
  const [thmSyncMeta, setThmSyncMeta] = useState(null)
  const [thmSyncForm, setThmSyncForm] = useState({ profile: '', skills: '', rooms: '' })
  const [thmSyncBusy, setThmSyncBusy] = useState(false)
  const [thmSyncNotice, setThmSyncNotice] = useState('')
  const [manualRooms, setManualRooms] = useState([])
  const [roomForm, setRoomForm] = useState({ url: '', name: '', skills: [], boost: 5 })
  const [roomBusy, setRoomBusy] = useState(false)
  const [roomNotice, setRoomNotice] = useState('')
  const reducedMotion = useReducedMotion()
  const clock = useClock()
  const routeRef = useRef(route)
  const menuIndexRef = useRef(0)
  const transitioning = useRef(false)
  const audioUnlocked = useRef(false)
  const wipeRef = useRef(null)
  const sfxRef = useRef(null)
  const bgRef = useRef(null)
  const cursorRef = useRef(null)
  const goToRef = useRef(() => {})

  useParallax(bgRef, reducedMotion)
  useSpriteCursor(cursorRef, reducedMotion)

  /* ---------- Sound (browsers block audio until first user gesture) ---------- */
  const playSelect = () => {
    if (!audioUnlocked.current || !sfxRef.current) {
      return
    }
    try {
      sfxRef.current.currentTime = 0
      const p = sfxRef.current.play()
      if (p && p.catch) {
        p.catch(() => {})
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const unlock = () => {
      audioUnlocked.current = true
    }
    window.addEventListener('pointerdown', unlock, { once: true, capture: true })
    window.addEventListener('keydown', unlock, { once: true, capture: true })
    if (sfxRef.current) {
      sfxRef.current.volume = 0.45
    }
    setLoaded(true)
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [])

  /* ---------- Diagonal wipe; swap() runs mid-way while the screen is covered ---------- */
  const wipe = (swap, done) => {
    const w = wipeRef.current
    if (reducedMotion || !w) {
      swap()
      done()
      return
    }
    w.classList.remove('go')
    void w.offsetWidth // restart animation
    w.classList.add('go')
    setTimeout(swap, 340)
    setTimeout(done, 720)
  }

  const goTo = (screen) => {
    if (transitioning.current || screen === routeRef.current) {
      return
    }
    transitioning.current = true
    playSelect()
    wipe(
      () => {
        routeRef.current = screen
        setRoute(screen)
        const nextHash = routeHash(screen)
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash
        }
      },
      () => {
        transitioning.current = false
      }
    )
  }
  goToRef.current = goTo

  useEffect(() => {
    const sync = () => {
      const next = parseRouteFromHash()
      if (next === routeRef.current) {
        return
      }
      if (transitioning.current) {
        setTimeout(sync, 400)
        return
      }
      goToRef.current(next)
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.body.dataset.screen = route
    document.querySelector('#stage .screen.active')?.scrollTo?.(0, 0)
  }, [route])

  useEffect(() => {
    Object.keys(MENU_ART).forEach((id) => {
      document.body.classList.toggle(`has-art-${id}`, Boolean(artReady[id]))
    })
  }, [artReady])

  // skill bars refill every time the Skills screen is shown
  useEffect(() => {
    if (route !== 'skills') {
      setBarsOn(false)
      return undefined
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setBarsOn(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [route])

  const selectMenu = (index, items) => {
    const n = items.length
    const next = ((index % n) + n) % n
    if (next !== menuIndexRef.current) {
      playSelect()
    }
    menuIndexRef.current = next
    setMenuIndex(next)
  }

  const [profile, setProfile] = useState(null)
  const [repos, setRepos] = useState([])
  const [thmResponse, setThmResponse] = useState(null)
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

  const loadCoreData = async () => {
    setLoading(true)
    setError('')

    try {
      const [profileRes, reposRes] = await Promise.all([
        fetch(`${API}/api/profile`),
        fetch(`${API}/api/repos`)
      ])

      if (!profileRes.ok || !reposRes.ok) {
        throw new Error('Unable to load profile or repository data.')
      }

      const [profileJson, reposJson] = await Promise.all([
        profileRes.json(),
        reposRes.json()
      ])

      setProfile(profileJson)
      setRepos(Array.isArray(reposJson) ? reposJson : [])
    } catch (loadError) {
      setError(loadError.message || 'Failed to load portfolio data.')
    } finally {
      setLoading(false)
    }
  }

  const loadTHMData = async () => {
    try {
      const response = await fetch(`${API}/api/tryhackme`)
      if (!response.ok) {
        return
      }
      const payload = await response.json()
      setThmResponse(payload)
    } catch {
      // Do not block page rendering on optional TryHackMe enrichment.
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
      goTo('missions')
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
    if (route === 'cv' || profile) {
      return
    }
    loadCoreData()
  }, [route, profile])

  useEffect(() => {
    if (route === 'cv' || thmResponse) {
      return
    }
    loadTHMData()
  }, [route, thmResponse])

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

  const projects = useMemo(() => {
    const curated = FEATURED_PROJECTS.map((project) => {
      const key = normalizeProjectKey(project.name)
      const overrideLanguages = PROJECT_LANGUAGE_OVERRIDES[key]
      const overrideDescription = PROJECT_DESCRIPTION_OVERRIDES[key]
      const languages = Array.isArray(project.languages) && project.languages.length
        ? project.languages
        : overrideLanguages
      const overrideURL = PROJECT_URL_OVERRIDES[key]

      return {
        ...project,
        description: overrideDescription || project.description,
        url: overrideURL || project.url,
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
        const overrideDescription = PROJECT_DESCRIPTION_OVERRIDES[key]
        const languages = Array.isArray(overrideLanguages) && overrideLanguages.length
          ? overrideLanguages
          : (repo.language ? [repo.language] : undefined)
        const overrideURL = PROJECT_URL_OVERRIDES[key]

        return {
          name: repo.name,
          description: overrideDescription || repo.description || 'No description available yet.',
          url: overrideURL || repo.url,
          language: languages?.[0] || repo.language || 'Unknown',
          languages,
          pushedAt: repo.pushedAt,
          stars: repo.stars,
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

  const menuItems = isAdminAuthenticated ? [...MENU_ITEMS, ADMIN_MENU_ITEM] : MENU_ITEMS
  const menuItemsRef = useRef(menuItems)
  menuItemsRef.current = menuItems

  /* ---------- Keyboard: ↑↓ select · Enter confirm · Esc back ---------- */
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }
      if (routeRef.current === 'home') {
        if (e.key === 'ArrowDown') {
          selectMenu(menuIndexRef.current + 1, menuItemsRef.current)
          e.preventDefault()
        } else if (e.key === 'ArrowUp') {
          selectMenu(menuIndexRef.current - 1, menuItemsRef.current)
          e.preventDefault()
        } else if (e.key === 'Enter') {
          goToRef.current(menuItemsRef.current[menuIndexRef.current]?.id || 'projects')
        }
      } else if (e.key === 'Escape') {
        goToRef.current('home')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleContactSubmit = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    if (data._honey) {
      return
    }
    if (!String(data.name || '').trim() || !String(data.email || '').trim() || !String(data.message || '').trim()) {
      setContactStatus('Fill in all three fields first.')
      return
    }
    setContactBusy(true)
    setContactStatus('Sending…')
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: data.name, email: data.email, message: data.message, _subject: `Portfolio message from ${data.name}` })
      })
      if (!res.ok) {
        throw new Error(String(res.status))
      }
      setContactStatus("Sent! I'll get back to you soon.")
      form.reset()
      playSelect()
    } catch {
      setContactStatus('Could not reach the relay, opening your email app instead…')
      const subject = encodeURIComponent(`Portfolio message from ${data.name}`)
      const body = encodeURIComponent(`${data.message}\n\nReply to: ${data.email}`)
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
    } finally {
      setContactBusy(false)
    }
  }

  const loadThmSyncMeta = async () => {
    const token = String(adminToken || '').trim()
    if (!token) {
      return
    }
    try {
      const response = await fetch(`${API}/api/admin/tryhackme/snapshot`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        setThmSyncMeta(await response.json())
      }
    } catch {
      // panel still renders without meta
    }
  }

  const loadManualRooms = async () => {
    const token = String(adminToken || '').trim()
    if (!token) {
      return
    }
    try {
      const response = await fetch(`${API}/api/admin/tryhackme/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const payload = await response.json()
        setManualRooms(Array.isArray(payload?.rooms) ? payload.rooms : [])
      }
    } catch {
      // panel still renders without the list
    }
  }

  useEffect(() => {
    if (route === 'missions' && isAdminAuthenticated) {
      loadThmSyncMeta()
      loadManualRooms()
    }
  }, [route, isAdminAuthenticated])

  const handleAddManualRoom = async (event) => {
    event.preventDefault()
    const token = String(adminToken || '').trim()
    if (!token) {
      setRoomNotice('Login is required.')
      return
    }
    if (!roomForm.url.trim()) {
      setRoomNotice('Paste the room share link first.')
      return
    }
    setRoomBusy(true)
    setRoomNotice('')
    try {
      const response = await fetch(`${API}/api/admin/tryhackme/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          url: roomForm.url.trim(),
          name: roomForm.name.trim(),
          skills: roomForm.skills,
          boost: Number(roomForm.boost) || 5
        })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Could not add room.'))
      }
      const payload = await response.json()
      setManualRooms(Array.isArray(payload?.rooms) ? payload.rooms : [])
      setRoomNotice(`${payload.status === 'updated' ? 'Updated' : 'Added'} “${payload.room?.name}”.`)
      setRoomForm({ url: '', name: '', skills: [], boost: 5 })
      setThmResponse(null)
      playSelect()
    } catch (roomError) {
      setRoomNotice(roomError.message || 'Could not add room.')
    } finally {
      setRoomBusy(false)
    }
  }

  const handleDeleteManualRoom = async (code) => {
    const token = String(adminToken || '').trim()
    if (!token) {
      return
    }
    setRoomBusy(true)
    try {
      const response = await fetch(`${API}/api/admin/tryhackme/rooms/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Could not remove room.'))
      }
      const payload = await response.json()
      setManualRooms(Array.isArray(payload?.rooms) ? payload.rooms : [])
      setRoomNotice('Room removed.')
      setThmResponse(null)
    } catch (roomError) {
      setRoomNotice(roomError.message || 'Could not remove room.')
    } finally {
      setRoomBusy(false)
    }
  }

  const toggleRoomSkill = (skill) => setRoomForm((current) => ({
    ...current,
    skills: current.skills.includes(skill) ? current.skills.filter((item) => item !== skill) : [...current.skills, skill]
  }))

  const handleThmSync = async (event) => {
    event.preventDefault()
    const token = String(adminToken || '').trim()
    if (!token) {
      setThmSyncNotice('Login is required.')
      return
    }
    if (!thmSyncForm.profile.trim() && !thmSyncForm.skills.trim() && !thmSyncForm.rooms.trim()) {
      setThmSyncNotice('Paste at least one JSON response first.')
      return
    }
    setThmSyncBusy(true)
    setThmSyncNotice('')
    try {
      const response = await fetch(`${API}/api/admin/tryhackme/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          profile: thmSyncForm.profile.trim(),
          skills: thmSyncForm.skills.trim(),
          rooms: thmSyncForm.rooms.trim()
        })
      })
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, 'Sync failed.'))
      }
      const meta = await response.json()
      setThmSyncMeta(meta)
      setThmSyncForm({ profile: '', skills: '', rooms: '' })
      setThmSyncNotice(`Saved · ${meta.skillsParsed ?? 0} skills · ${meta.roomsParsed ?? 0} rooms.`)
      setThmResponse(null) // triggers a fresh /api/tryhackme load
      playSelect()
    } catch (syncError) {
      setThmSyncNotice(syncError.message || 'Sync failed.')
    } finally {
      setThmSyncBusy(false)
    }
  }

  const thmStaleNote = useMemo(() => {
    if (!thmResponse?.stale) {
      return ''
    }
    const when = thmResponse.snapshotUpdatedAt ? formatDate(thmResponse.snapshotUpdatedAt) : 'an earlier sync'
    return `Live sync blocked by TryHackMe · showing snapshot from ${when}`
  }, [thmResponse])

  const displayName = profile?.displayName || 'Shayden Naidoo'
  const nameParts = displayName.toUpperCase().split(/\s+/).filter(Boolean)
  const headline = profile?.headline || 'Cybersecurity & Software Engineering'
  const bio = profile?.bio || 'Portfolio profile loading.'
  const githubUrl = useMemo(() => {
    const match = repos.map((repo) => String(repo?.url || '')).find((url) => /github\.com\/[^/]+\//.test(url))
    return match ? match.replace(/(github\.com\/[^/]+).*/, '$1') : GITHUB_FALLBACK
  }, [repos])
  const thmProfileUrl = thmUsername ? `https://tryhackme.com/p/${encodeURIComponent(thmUsername)}` : ''
  const featuredProjects = projects.slice(0, FEATURED_PROJECTS.length)
  const repoProjects = projects.slice(FEATURED_PROJECTS.length)
  const repoStatus = loading
    ? 'Contacting GitHub…'
    : error
      ? 'Showing pinned work · GitHub API unavailable right now'
      : `${repoProjects.length} repositories · live from GitHub`

  return (
    <>
      {/* Background art layers */}
      <div id="bg" aria-hidden="true" ref={bgRef}>
        <div className="bg-layer" id="bg-stripes" />
        <svg className="bg-star" style={{ left: '6%', top: '8%', width: '26vmax', height: '26vmax' }} viewBox="0 0 100 100">
          <polygon points="50,0 60,35 98,35 68,57 78,94 50,72 22,94 32,57 2,35 40,35" fill="#000" />
        </svg>
        <svg className="bg-star s2" style={{ right: '4%', bottom: '6%', width: '34vmax', height: '34vmax' }} viewBox="0 0 100 100">
          <polygon points="50,0 60,35 98,35 68,57 78,94 50,72 22,94 32,57 2,35 40,35" fill="#fff" />
        </svg>
        {Object.entries(MENU_ART).map(([id, src]) => (
          <MenuArt key={id} id={id} src={src} onReady={(name) => setArtReady((current) => ({ ...current, [name]: true }))} />
        ))}
        <div className="bg-layer" id="bg-halftone" />
        <div className="bg-layer" id="bg-vignette" />
      </div>
      <div id="slash" aria-hidden="true" />

      {/* Screen transition wipe */}
      <div id="wipe" aria-hidden="true" ref={wipeRef}>
        <div className="pane p3" />
        <div className="pane p2" />
        <div className="pane p1" />
        <div className="flash" />
      </div>

      {/* Custom animated cursor + select sound */}
      <div id="cursor" aria-hidden="true" ref={cursorRef} />
      <audio ref={sfxRef} src={SELECT_SFX} preload="auto" />

      <div id="shell" className={loaded ? 'loaded' : ''}>
        <div id="hud-top">
          <div className="hud-tag">Portfolio // {displayName}</div>
          <div className="hud-tag alt">Pretoria · {headline}</div>
        </div>

        <div id="stage">

          {/* HOME */}
          <section className={`screen${route === 'home' ? ' active' : ''}`} id="screen-home" aria-label="Main menu">
            <div id="intro-eyebrow">Take a look at my work</div>
            <h1 id="big-name" onClick={() => (route === 'home' ? playSelect() : goTo('home'))}>
              {nameParts.map((part, index) => <Ransom key={`${part}-${index}`} text={part} />)}
            </h1>
            <p id="tagline">
              <strong>{headline}</strong>
              {bio}
            </p>
            <nav id="menu" aria-label="Sections">
              {menuItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`menu-item${index === menuIndex ? ' sel' : ''}`}
                  onMouseEnter={() => selectMenu(index, menuItems)}
                  onFocus={() => selectMenu(index, menuItems)}
                  onClick={() => goTo(item.id)}
                >
                  <Ransom text={item.label} /><span className="cursor-mark">◀</span>
                </button>
              ))}
            </nav>
          </section>

          {/* PROJECTS */}
          <section className={`screen sub${route === 'projects' ? ' active' : ''}`} id="screen-projects" aria-label="Projects">
            <div className="screen-head"><Ransom text="PROJECTS" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>
            <div className="grid-label"><span className="bar" />Featured</div>
            <div id="feat-grid" className="grid">
              {featuredProjects.map((project, index) => (
                <ProjectCard key={`feat-${project.name}`} project={project} index={index} featured />
              ))}
            </div>
            <div className="grid-label"><span className="bar" />All repositories</div>
            <div id="repo-status">{repoStatus}</div>
            <div id="repo-grid" className="grid">
              {repoProjects.map((project, index) => (
                <ProjectCard key={`repo-${project.name}`} project={project} index={index} />
              ))}
            </div>
          </section>

          {/* SKILLS */}
          <section className={`screen sub${route === 'skills' ? ' active' : ''}`} id="screen-skills" aria-label="Skills">
            <div className="screen-head"><Ransom text="SKILLS" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>

            <div className="skill-group">
              <h3>Languages</h3>
              <div className="chip-cloud">
                {languages.map((lang) => (
                  <span className="chip" key={lang} style={{ '--tilt': tiltFor(lang) }}>
                    <LanguageIcon language={lang} />
                    <span>{lang}</span>
                  </span>
                ))}
                {!languages.length && <p className="note">Languages will appear once profile data loads.</p>}
              </div>
            </div>

            <div className="skill-group">
              <h3>TryHackMe Intel</h3>
              {thmDisabled ? (
                <p className="note">{shortNote(thmData.__message)}</p>
              ) : thmData?.error && !thmProfile?.publicProfile && !thmUsername ? (
                <p className="note">{shortNote(thmData.error)}</p>
              ) : (
                <div className="thm-layout">
                  <div className="thm-left">
                    <div className="ink-wrap">
                      <div className="ink thm-card" aria-label="TryHackMe identity card">
                        <span className="thm-arcana">Arcana · {thmArcana}</span>
                        <div className="thm-id">
                          <div className="thm-avatar">
                            {thmAvatar
                              ? <img src={thmAvatar} alt={`${thmUsername || 'TryHackMe'} avatar`} loading="lazy" />
                              : (thmUsername || 'T').slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="thm-ribbon">TryHackMe Profile</p>
                            <p className="thm-name">
                              {thmUsername || 'Unknown Operative'}
                              {thmTagLine && <span className="thm-tags">{thmTagLine}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="thm-stats">
                          <div><span>Points</span><strong>{formatNumber(thmPoints ?? 'Unknown')}</strong></div>
                          <div><span>Rank</span>{formatNumber(thmRank || 'Unknown')}</div>
                          <div><span>Level</span>{thmLevel ?? 'Unknown'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="stat-tiles">
                      <div className="stat-tile" style={{ '--tilt': '-1deg' }}>
                        <span>Global Rank</span>
                        <strong>{formatNumber(thmRank || 'Unknown')}</strong>
                      </div>
                      <div className="stat-tile" style={{ '--tilt': '.6deg' }}>
                        <span>Rooms Completed</span>
                        <strong>{formatNumber(thmRoomCount ?? (thmRooms.length || 'Unknown'))}</strong>
                      </div>
                      <div className="stat-tile" style={{ '--tilt': '-.4deg' }}>
                        <span>Skills Tracked</span>
                        <strong>{thmSkillMatrix.length}</strong>
                      </div>
                    </div>

                  </div>

                  <div className="thm-right">
                    <div className="ink-wrap">
                      <div className="ink">
                        <div className="ink-title">Persona stats</div>
                        <SkillRadar skills={thmSkills} />
                        <p className="thm-sync">{thmStaleNote || 'Live sync source: /api/tryhackme'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="thm-full">
                    <div className="grid-label"><span className="bar" />Skills matrix</div>
                    {thmSkillMatrix.map((skill, index) => (
                      <div className="skill-row" key={skill.name}>
                        <span className="name">{skill.name}</span>
                        <div className="skill-bar">
                          <div className="fill" style={{ width: barsOn ? `${normalizeSkillValue(skill.value)}%` : 0, transitionDelay: `${index * 60}ms` }} />
                        </div>
                        <span className="lv">{Math.round(skill.value)}<small>/100</small></span>
                      </div>
                    ))}
                    {!thmSkills.length && <p className="note">No canonical skills were found in the current TryHackMe payload.</p>}
                    {thmSkillsError && <p className="note">{shortNote(thmSkillsError)}</p>}
                  </div>
                </div>
              )}
            </div>

            {!thmDisabled && (
              <div className="skill-group">
                <h3>Completed Rooms</h3>
                {thmRooms.length ? (
                  <ul className="rooms">
                    {thmRooms.map((room) => <li key={room} style={{ '--tilt': tiltFor(room) }}>{room}</li>)}
                  </ul>
                ) : (
                  <p className="note">No room names were returned by the current TryHackMe payload.</p>
                )}
                {thmRoomCount && thmRooms.length > 0 && thmRoomCount > thmRooms.length && (
                  <p className="note">Showing {thmRooms.length} of {thmRoomCount} completed rooms.</p>
                )}
                {thmRoomsError && <p className="note">{shortNote(thmRoomsError)}</p>}
              </div>
            )}
          </section>

          {/* ABOUT */}
          <section className={`screen sub align-right${route === 'about' ? ' active' : ''}`} id="screen-about" aria-label="About">
            <div className="screen-head"><Ransom text="ABOUT" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>
            <div className="paper">
              <figure className="about-photo">
                <img src={PROFILE_IMAGE} alt={displayName} />
                <figcaption>{nameParts[0] || 'Shayden'} · Pretoria</figcaption>
              </figure>
              <p className="quote">
                <em>{headline}</em> — {bio}
              </p>
              <br />
              <p>
                I'm a Computer Science student at the <span className="stamp">University of Pretoria</span>,
                focused on offensive security and full-stack engineering. You can explore my repositories at{' '}
                <a href={githubUrl} target="_blank" rel="noreferrer">{githubUrl.replace(/^https?:\/\//, '')}</a>
                {thmProfileUrl && (
                  <>
                    {' '}and follow my TryHackMe progress at{' '}
                    <a href={thmProfileUrl} target="_blank" rel="noreferrer">tryhackme.com/p/{thmUsername}</a>
                  </>
                )}.
              </p>

              {experiences.length > 0 && <h3>Experience</h3>}
              {experiences.map((exp) => (
                <div key={`${exp.company}-${exp.role}`} className="exp">
                  <div className="exp-role">{exp.role}</div>
                  <div className="exp-co">{exp.company} · {exp.dateRange}</div>
                  {Array.isArray(exp.description) && exp.description.length > 0 && (
                    <ul>
                      {exp.description.map((point, idx) => <li key={`${exp.role}-point-${idx}`}>{point}</li>)}
                    </ul>
                  )}
                </div>
              ))}

              {certifications.length > 0 && <h3>Certifications</h3>}
              {certifications.map((cert) => (
                <div key={`${cert.name}-${cert.date}`} className="exp">
                  <div className="exp-role"><a href={cert.url} target="_blank" rel="noreferrer">{cert.name}</a></div>
                  <div className="exp-co">{cert.issuer} · {cert.date}</div>
                </div>
              ))}
            </div>
            <div className="btn-row">
              <a className="cv-btn" href={CV_PDF} download="Shayden_Naidoo_CV.pdf"><span>⬇ Download my CV (PDF)</span></a>
              <button type="button" className="cv-btn small" onClick={() => goTo('cv')}><span>View CV →</span></button>
            </div>
          </section>

          {/* CV */}
          <section className={`screen sub align-right${route === 'cv' ? ' active' : ''}`} id="screen-cv" aria-label="Curriculum vitae">
            <div className="screen-head"><Ransom text="CV" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>
            <div className="cv-frame">
              {route === 'cv' && <iframe title={`${displayName} CV`} src={CV_PDF} />}
            </div>
            <div className="btn-row">
              <a className="cv-btn" href={CV_PDF} download="Shayden_Naidoo_CV.pdf"><span>⬇ Download (PDF)</span></a>
              <a className="cv-btn small" href={CV_PDF} target="_blank" rel="noreferrer"><span>Open in new tab ↗</span></a>
            </div>
          </section>

          {/* BLOG */}
          <section className={`screen sub${route === 'blog' ? ' active' : ''}`} id="screen-blog" aria-label="Blog">
            <div className="screen-head"><Ransom text="BLOG" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>

            {isAdminAuthenticated && (
              <form className="paper" style={{ maxWidth: 620 }} onSubmit={handleCreateBlogPost}>
                <div className="form-head">Write a post</div>
                <label className="field">
                  <span>Update</span>
                  <textarea
                    value={composerContent}
                    onChange={(event) => setComposerContent(event.target.value)}
                    placeholder="Write a new post update..."
                    rows={4}
                    maxLength={1000}
                  />
                </label>
                {composerImageData && (
                  <div className="img-preview"><img src={composerImageData} alt="Selected blog upload preview" /></div>
                )}
                <div className="form-foot">
                  <label className="upload-btn">
                    <input type="file" accept="image/*" onChange={handleComposerImageChange} />
                    Upload image
                  </label>
                  <button type="submit" className="cv-btn small" disabled={composerBusy}>
                    <span>{composerBusy ? 'Publishing…' : 'Publish ➤'}</span>
                  </button>
                  {composerNotice && <div className="form-status" role="status">{composerNotice}</div>}
                </div>
              </form>
            )}

            <div className="grid-label"><span className="bar" />Latest posts</div>
            {blogFeed.length ? (
              <div className="grid" style={{ paddingBottom: '4vh' }}>
                {blogFeed.map((post, index) => (
                  <article
                    className="card blog-card"
                    key={post.id}
                    style={{ '--tilt': tiltFor(post.id), '--d': `${index * 70}ms` }}
                  >
                    <Thumb src={post.imageData} alt="Blog post upload" />
                    <span className="lang">{post.dateLabel}</span>
                    <div className="byline">
                      <strong>{displayName}</strong>
                      <span>@{displayName.toLowerCase().replace(/\s+/g, '')}</span>
                    </div>
                    {post.title && <h3>{splitTitle(post.title)}</h3>}
                    {post.content && <p>{post.content}</p>}
                    {post.link && (
                      <div className="meta">
                        <span>Link</span>
                        <a className="go" href={post.link} target="_blank" rel="noreferrer">Open ↗</a>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="note">No posts published yet.</p>
            )}
            <div className="contact-list" style={{ paddingTop: '3vh' }}>
              <a className="contact-chip" href={linkedInUrl} target="_blank" rel="noreferrer"><span>Follow on LinkedIn ↗</span></a>
            </div>
          </section>

          {/* CONTACT */}
          <section className={`screen sub align-right${route === 'contact' ? ' active' : ''}`} id="screen-contact" aria-label="Contact">
            <div className="screen-head"><Ransom text="CONTACT" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>
            <div className="paper" style={{ maxWidth: 620 }}>
              <p>
                I'm open to <strong>security and software engineering roles</strong>, internships and
                collaborations. Find me on any of these:
              </p>
            </div>
            <div className="contact-list">
              <a className="contact-chip" href={linkedInUrl} target="_blank" rel="noreferrer"><span>LinkedIn ↗</span></a>
              <a className="contact-chip" href={githubUrl} target="_blank" rel="noreferrer"><span>GitHub ↗</span></a>
              {thmProfileUrl && <a className="contact-chip" href={thmProfileUrl} target="_blank" rel="noreferrer"><span>TryHackMe ↗</span></a>}
              {CONTACT_EMAIL && <a className="contact-chip" href={`mailto:${CONTACT_EMAIL}`}><span>Email ✉</span></a>}
              <a className="contact-chip" href={CV_PDF} download="Shayden_Naidoo_CV.pdf"><span>CV ⬇</span></a>
            </div>

            {CONTACT_EMAIL && (
              <form className="paper" style={{ maxWidth: 620 }} noValidate onSubmit={handleContactSubmit}>
                <div className="form-head">Send me a message</div>
                <label className="field"><span>Name</span><input type="text" name="name" required maxLength={100} autoComplete="name" /></label>
                <label className="field"><span>Your email</span><input type="email" name="email" required maxLength={150} autoComplete="email" /></label>
                <label className="field"><span>Message</span><textarea name="message" required rows={5} maxLength={3000} /></label>
                <input type="text" name="_honey" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -5000 }} aria-hidden="true" />
                <div className="form-foot">
                  <button type="submit" className="cv-btn small" disabled={contactBusy}><span>Send it ➤</span></button>
                  <div className="form-status" role="status">{contactStatus}</div>
                </div>
              </form>
            )}

            {/* Admin access */}
            {isAdminAuthenticated ? (
              <>
                <div className="paper" style={{ maxWidth: 620 }}>
                  <div className="form-head">Phantom access</div>
                  <p>Signed in as <span className="stamp">{adminUsername}</span></p>
                  {adminNotice && <p className="form-status">{adminNotice}</p>}
                </div>
                <div className="contact-list">
                  <button type="button" className="contact-chip" onClick={() => goTo('blog')}><span>Write post ✎</span></button>
                  <button type="button" className="contact-chip" onClick={() => goTo('missions')}><span>Mission Control ▶</span></button>
                  <button type="button" className="contact-chip danger" onClick={handleAdminLogout}><span>Log out ✕</span></button>
                </div>
              </>
            ) : (
              <form className="paper" style={{ maxWidth: 620 }} onSubmit={handleAdminLogin}>
                <div className="form-head">Phantom access</div>
                <label className="field">
                  <span>Admin username</span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Admin password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <div className="form-foot">
                  <button type="submit" className="cv-btn small" disabled={adminChecking}>
                    <span>{adminChecking ? 'Signing in…' : 'Log in ➤'}</span>
                  </button>
                  {adminNotice && <div className="form-status err" role="status">{adminNotice}</div>}
                </div>
              </form>
            )}
          </section>

          {/* MISSIONS (admin) */}
          <section className={`screen sub${route === 'missions' ? ' active' : ''}`} id="screen-missions" aria-label="Mission Control">
            <div className="screen-head"><Ransom text="MISSIONS" /></div>
            <button type="button" className="back-hint" onClick={() => goTo('home')}>ESC · Back</button>

            {!isAdminAuthenticated ? (
              <>
                <p className="note">Admin login is required to access Mission Control.</p>
                <div className="contact-list">
                  <button type="button" className="contact-chip" onClick={() => goTo('contact')}><span>Go to login ▶</span></button>
                </div>
              </>
            ) : (
              <>
                {missionError && <p className="note" style={{ color: 'var(--white)', background: 'var(--black)', display: 'inline-block', padding: '4px 10px' }}>{missionError}</p>}
                {missionNotice && <p className="note">{missionNotice}</p>}

                {missionLoading && !missionControl ? (
                  <p className="note">Loading Mission Control data…</p>
                ) : (
                  <div className="mission-layout">
                    <div className="mission-column">
                      <form className="paper" onSubmit={handleCreateMission}>
                        <div className="form-head">Create mission</div>
                        <label className="field">
                          <span>Title</span>
                          <input
                            type="text"
                            placeholder="Mission title"
                            value={missionForm.title}
                            maxLength={140}
                            onChange={(event) => setMissionForm((current) => ({ ...current, title: event.target.value }))}
                          />
                        </label>
                        <label className="field">
                          <span>Description</span>
                          <textarea
                            rows={3}
                            maxLength={500}
                            placeholder="Description (optional)"
                            value={missionForm.description}
                            onChange={(event) => setMissionForm((current) => ({ ...current, description: event.target.value }))}
                          />
                        </label>
                        <div className="field-row">
                          <label className="field">
                            <span>Type</span>
                            <select
                              value={missionForm.type}
                              onChange={(event) => setMissionForm((current) => ({ ...current, type: event.target.value }))}
                            >
                              {MISSION_TYPES.map((type) => <option value={type} key={type}>{formatMissionType(type)}</option>)}
                            </select>
                          </label>
                          <label className="field">
                            <span>Priority</span>
                            <select
                              value={missionForm.priority}
                              onChange={(event) => setMissionForm((current) => ({ ...current, priority: event.target.value }))}
                            >
                              {MISSION_PRIORITIES.map((priority) => <option value={priority} key={priority}>{formatMissionPriority(priority)}</option>)}
                            </select>
                          </label>
                        </div>
                        <div className="field-row">
                          <label className="field">
                            <span>Due date</span>
                            <input
                              type="date"
                              value={missionForm.dueDate}
                              onChange={(event) => setMissionForm((current) => ({ ...current, dueDate: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span>Module</span>
                            <select
                              value={missionForm.moduleCode}
                              onChange={(event) => setMissionForm((current) => ({ ...current, moduleCode: event.target.value }))}
                            >
                              <option value="">General</option>
                              {missionModuleCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                            </select>
                          </label>
                        </div>
                        <div className="form-foot">
                          <button type="submit" className="cv-btn small" disabled={missionBusy}>
                            <span>{missionBusy ? 'Saving…' : 'Add mission ➤'}</span>
                          </button>
                        </div>
                      </form>

                      <section className="paper">
                        <div className="form-head">Daily missions</div>
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
                          <p>No active daily missions.</p>
                        )}
                      </section>

                      <section className="paper">
                        <div className="form-head">Upcoming deadlines</div>
                        {upcomingMissions.length ? (
                          <ul className="mission-list">
                            {upcomingMissions.map((mission) => (
                              <li key={mission.id} className="mission-item">
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
                          <p>No upcoming missions right now.</p>
                        )}
                      </section>
                    </div>

                    <div className="mission-column">
                      <section className="paper">
                        <div className="mission-calendar-head">
                          <div className="form-head">Calendar</div>
                          <div className="mission-calendar-nav">
                            <button
                              type="button"
                              className="back-hint"
                              style={{ marginLeft: 0 }}
                              onClick={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                            >
                              ◀ Prev
                            </button>
                            <strong>{calendarHeading}</strong>
                            <button
                              type="button"
                              className="back-hint"
                              style={{ marginLeft: 0 }}
                              onClick={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                            >
                              Next ▶
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

                      <form className="paper" onSubmit={handleThmSync}>
                        <div className="form-head">TryHackMe sync</div>
                        <p>
                          TryHackMe blocks server-side requests with a bot challenge, but your browser passes it.
                          Open each endpoint in a new tab, copy the JSON, paste it below and save. Blank fields keep the previous snapshot.
                          For rooms you can paste several pages one after another.
                        </p>
                        {thmSyncMeta?.roomsPages?.length > 0 && (
                          <p className="mission-meta" style={{ marginTop: 8 }}>
                            Rooms come 16 per page — open each page, copy the JSON and paste them all into the rooms box, one after another:{' '}
                            {thmSyncMeta.roomsPages.map((url, index) => (
                              <span key={url}>{index > 0 && ' · '}<a href={url} target="_blank" rel="noreferrer">page {index + 1}</a></span>
                            ))}
                          </p>
                        )}
                        {['profile', 'skills', 'rooms'].map((key) => (
                          <label className="field" key={key}>
                            <span>
                              {key} JSON
                              {thmSyncMeta?.endpoints?.[key] && (
                                <>
                                  {' · '}
                                  <a href={thmSyncMeta.endpoints[key]} target="_blank" rel="noreferrer">open endpoint ↗</a>
                                </>
                              )}
                            </span>
                            <textarea
                              rows={3}
                              spellCheck={false}
                              placeholder={`Paste the ${key} JSON here`}
                              value={thmSyncForm[key]}
                              onChange={(event) => setThmSyncForm((current) => ({ ...current, [key]: event.target.value }))}
                            />
                          </label>
                        ))}
                        <div className="form-foot">
                          <button type="submit" className="cv-btn small" disabled={thmSyncBusy}>
                            <span>{thmSyncBusy ? 'Saving…' : 'Save snapshot ➤'}</span>
                          </button>
                          {thmSyncNotice && <div className="form-status" role="status">{thmSyncNotice}</div>}
                        </div>
                      </form>

                      <form className="paper" onSubmit={handleAddManualRoom}>
                        <div className="form-head">Private rooms</div>
                        <p>
                          Rooms that are private don't show on your public profile. Paste the “share your achievement” link,
                          tick the skills the room trained, and it will be added to your completed rooms and boost those
                          skills in the matrix.
                        </p>
                        <label className="field">
                          <span>Share link or room URL</span>
                          <input
                            type="text"
                            placeholder="https://tryhackme.com/room/…"
                            value={roomForm.url}
                            onChange={(event) => setRoomForm((current) => ({ ...current, url: event.target.value }))}
                          />
                        </label>
                        <div className="field-row">
                          <label className="field">
                            <span>Display name (optional)</span>
                            <input
                              type="text"
                              maxLength={120}
                              placeholder="Auto from the link"
                              value={roomForm.name}
                              onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span>Skill boost per category (1–25)</span>
                            <input
                              type="number"
                              min="1"
                              max="25"
                              value={roomForm.boost}
                              onChange={(event) => setRoomForm((current) => ({ ...current, boost: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="field">
                          <span>Skills trained</span>
                          <div className="skill-picks">
                            {THM_SKILL_ORDER.map((skill) => (
                              <label key={skill} className={`skill-pick${roomForm.skills.includes(skill) ? ' on' : ''}`}>
                                <input type="checkbox" checked={roomForm.skills.includes(skill)} onChange={() => toggleRoomSkill(skill)} />
                                {skill}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="form-foot">
                          <button type="submit" className="cv-btn small" disabled={roomBusy}>
                            <span>{roomBusy ? 'Saving…' : 'Add room ➤'}</span>
                          </button>
                          {roomNotice && <div className="form-status" role="status">{roomNotice}</div>}
                        </div>
                        {manualRooms.length > 0 && (
                          <ul className="mission-list" style={{ marginTop: 18 }}>
                            {manualRooms.map((room) => (
                              <li key={room.code} className="mission-item">
                                <div>
                                  <a href={room.url} target="_blank" rel="noreferrer">{room.name}</a>
                                  <p className="mission-meta">
                                    {room.skills?.length ? `${room.skills.join(' · ')} · +${room.boost}` : 'No skills selected'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="mission-delete"
                                  disabled={roomBusy}
                                  onClick={() => handleDeleteManualRoom(room.code)}
                                  aria-label={`Remove ${room.name}`}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </form>

                      <section className="paper">
                        <div className="form-head">Academic progress</div>
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
                                    className="cv-btn small"
                                    disabled={missionBusy}
                                    onClick={() => handleSaveModuleProgress(code)}
                                  >
                                    <span>Save</span>
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
                                    <label key={component.key} className="field">
                                      <span>{component.label} ({formatPercent(component.weight)})</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={draft?.marks?.[component.key] ?? ''}
                                        onChange={(event) => handleModuleDraftValue(code, component.key, event.target.value)}
                                      />
                                    </label>
                                  ))}
                                  <label className="field">
                                    <span>Exam Mark</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={draft?.examMark ?? ''}
                                      onChange={(event) => handleModuleExamDraft(code, event.target.value)}
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

        </div>

        <div id="hud-bottom">
          <span><span className="key">↑↓</span>Select</span>
          <span><span className="key">Enter</span>Confirm</span>
          <span><span className="key">Esc</span>Back</span>
          <span id="clock">{clock}</span>
        </div>
      </div>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
