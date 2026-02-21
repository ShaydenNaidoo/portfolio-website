const FALLBACK_IMAGE = "./img/projects/profile-photo.jpeg";

const fallbackProjects = [
  {
    name: "C++ City Builder",
    description: "A city-builder game made in C++ with six teammates for COS 214, showcasing multiple software design patterns.",
    url: "https://github.com/COS214-Project-2024/VScoders-and-the-Jetbrainstormers-Team-4",
    language: "C++",
    pushedAt: "",
    imageUrl: FALLBACK_IMAGE
  }
];

const apiBaseCandidates = () => {
  const fromWindow = window.PORTFOLIO_API_BASE;
  const sameOrigin = window.location.origin.startsWith("http") ? window.location.origin : "";
  return [...new Set([fromWindow, sameOrigin, "http://localhost:8080"].filter(Boolean))];
};

const fetchJSONWithFallback = async (path) => {
  let lastError = new Error("No API base candidates available.");
  for (const base of apiBaseCandidates()) {
    try {
      const response = await fetch(`${base}${path}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const formatDate = (iso) => {
  if (!iso) {
    return "N/A";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const pickDeep = (input, matcher) => {
  const queue = [input];
  const seen = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node)) {
      continue;
    }
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (matcher(key, value)) {
        return value;
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return undefined;
};

const extractRank = (raw) => {
  const rankValue = pickDeep(raw, (key, value) => /(^|_)(rank|ranking|globalrank|worldrank)$/i.test(key) && (typeof value === "number" || typeof value === "string"));
  return rankValue ?? "Unknown";
};

const extractRoomCount = (raw) => {
  const roomCount = pickDeep(raw, (key, value) => /(rooms?completed|completedrooms|rooms_count|roomcount)/i.test(key) && typeof value === "number");
  return typeof roomCount === "number" ? roomCount : null;
};

const extractCompletedRooms = (raw) => {
  const rooms = pickDeep(raw, (key, value) => /(completedrooms|roomscompleted|rooms_list|rooms)/i.test(key) && Array.isArray(value) && value.length > 0);
  if (!Array.isArray(rooms)) {
    return [];
  }

  return rooms
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object") {
        return item.title || item.name || item.roomName || item.slug || "";
      }
      return "";
    })
    .filter(Boolean);
};

const extractSkillEntries = (raw) => {
  const skillNode = pickDeep(raw, (key, value) => /skill(matrix|s)?/i.test(key) && (Array.isArray(value) || (value && typeof value === "object")));
  if (!skillNode) {
    return [];
  }

  const entries = [];
  if (Array.isArray(skillNode)) {
    for (const item of skillNode) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const name = item.name || item.skill || item.category || item.title;
      const value = Number(item.score ?? item.level ?? item.value ?? item.percent ?? item.percentage);
      if (name && Number.isFinite(value)) {
        entries.push({ name: String(name), value });
      }
    }
  } else {
    for (const [name, value] of Object.entries(skillNode)) {
      if (typeof value === "number") {
        entries.push({ name, value });
        continue;
      }
      if (value && typeof value === "object") {
        const numericValue = Number(value.score ?? value.level ?? value.value ?? value.percent ?? value.percentage);
        if (Number.isFinite(numericValue)) {
          entries.push({ name, value: numericValue });
        }
      }
    }
  }

  return entries
    .map((entry) => ({ ...entry, value: Math.max(0, Number(entry.value) || 0) }))
    .sort((a, b) => b.value - a.value);
};

const drawSkillStar = (svg, topSkills) => {
  const ns = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";

  const center = 200;
  const radius = 145;
  const points = 5;
  const levels = 4;

  const polyPoints = (scale = 1) => {
    const coords = [];
    for (let i = 0; i < points; i += 1) {
      const angle = (-Math.PI / 2) + (i * (Math.PI * 2 / points));
      const x = center + Math.cos(angle) * radius * scale;
      const y = center + Math.sin(angle) * radius * scale;
      coords.push(`${x},${y}`);
    }
    return coords.join(" ");
  };

  const shadowStar = document.createElementNS(ns, "polygon");
  shadowStar.setAttribute("points", polyPoints(1));
  shadowStar.setAttribute("fill", "rgba(255,255,255,0.08)");
  shadowStar.setAttribute("stroke", "#222");
  shadowStar.setAttribute("stroke-width", "20");
  svg.appendChild(shadowStar);

  for (let i = 1; i <= levels; i += 1) {
    const ring = document.createElementNS(ns, "polygon");
    ring.setAttribute("points", polyPoints(i / levels));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", i === levels ? "#474747" : "#2d2d2d");
    ring.setAttribute("stroke-width", i === levels ? "4" : "2");
    svg.appendChild(ring);
  }

  const displaySkills = topSkills.slice(0, 5);
  const max = Math.max(...displaySkills.map((skill) => skill.value), 1);
  const graphPoints = [];

  for (let i = 0; i < points; i += 1) {
    const skill = displaySkills[i] || { name: `Skill ${i + 1}`, value: 0 };
    const normalized = Math.max(0.15, Math.min(1, skill.value / max));
    const angle = (-Math.PI / 2) + (i * (Math.PI * 2 / points));
    const x = center + Math.cos(angle) * radius * normalized;
    const y = center + Math.sin(angle) * radius * normalized;
    graphPoints.push(`${x},${y}`);

    const marker = document.createElementNS(ns, "circle");
    marker.setAttribute("cx", x);
    marker.setAttribute("cy", y);
    marker.setAttribute("r", "4");
    marker.setAttribute("fill", "#f4bc11");
    svg.appendChild(marker);

    const labelRadius = radius + 32;
    const lx = center + Math.cos(angle) * labelRadius;
    const ly = center + Math.sin(angle) * labelRadius;

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", lx);
    label.setAttribute("y", ly);
    label.setAttribute("fill", "#f4bc11");
    label.setAttribute("font-family", "'Archivo Black', sans-serif");
    label.setAttribute("font-size", "14");
    label.setAttribute("text-anchor", "middle");
    label.textContent = `${skill.name}`;
    svg.appendChild(label);
  }

  const scorePolygon = document.createElementNS(ns, "polygon");
  scorePolygon.setAttribute("points", graphPoints.join(" "));
  scorePolygon.setAttribute("fill", "rgba(244,188,17,0.45)");
  scorePolygon.setAttribute("stroke", "#ffd96a");
  scorePolygon.setAttribute("stroke-width", "3");
  svg.appendChild(scorePolygon);

  const innerStar = document.createElementNS(ns, "polygon");
  innerStar.setAttribute("points", polyPoints(0.18));
  innerStar.setAttribute("fill", "#f4bc11");
  innerStar.setAttribute("stroke", "#d09500");
  innerStar.setAttribute("stroke-width", "4");
  svg.appendChild(innerStar);
};

const renderSkillsList = (container, skills) => {
  container.innerHTML = "";
  if (!skills.length) {
    container.textContent = "No skill matrix data found in TryHackMe response yet.";
    return;
  }

  const max = Math.max(...skills.map((item) => item.value), 1);
  for (const skill of skills) {
    const row = document.createElement("div");
    row.className = "skill-item";

    const label = document.createElement("strong");
    label.textContent = skill.name;

    const score = document.createElement("span");
    score.textContent = `${Math.round(skill.value)}`;

    const bar = document.createElement("div");
    bar.className = "skill-bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(6, (skill.value / max) * 100)}%`;

    bar.appendChild(fill);
    row.append(label, score, bar);
    container.appendChild(row);
  }
};

const renderRoomsList = (container, rooms, roomCount) => {
  container.innerHTML = "";

  const displayRooms = rooms.slice(0, 20);
  if (!displayRooms.length) {
    const line = document.createElement("li");
    line.textContent = roomCount ? `${roomCount} rooms completed (room names not exposed by API response).` : "No completed room names available from API response.";
    container.appendChild(line);
    return;
  }

  for (const room of displayRooms) {
    const line = document.createElement("li");
    line.textContent = room;
    container.appendChild(line);
  }

  if (rooms.length > displayRooms.length) {
    const extra = document.createElement("li");
    extra.textContent = `+${rooms.length - displayRooms.length} more rooms`;
    container.appendChild(extra);
  }
};

const setupProjects = async () => {
  const carousel = document.getElementById("projects-carousel");
  const prevButton = document.getElementById("carousel-prev");
  const nextButton = document.getElementById("carousel-next");

  const focusImage = document.getElementById("focus-image");
  const focusTitle = document.getElementById("focus-title");
  const focusDescription = document.getElementById("focus-description");
  const focusLanguage = document.getElementById("focus-language");
  const focusUpdated = document.getElementById("focus-updated");
  const focusLink = document.getElementById("focus-link");

  let projects = fallbackProjects;
  try {
    const data = await fetchJSONWithFallback("/api/repos");
    if (Array.isArray(data) && data.length) {
      projects = data.map((repo) => ({
        name: repo.name,
        description: repo.description || "No description provided.",
        url: repo.url,
        language: repo.language || "Unknown",
        pushedAt: repo.pushedAt,
        imageUrl: FALLBACK_IMAGE
      }));
    }
  } catch (error) {
    console.warn("Using fallback project list:", error);
  }

  const setFocus = (project, card) => {
    focusImage.src = project.imageUrl || FALLBACK_IMAGE;
    focusImage.alt = `${project.name} preview`;
    focusTitle.textContent = project.name;
    focusDescription.textContent = project.description;
    focusLanguage.textContent = `Language: ${project.language || "Unknown"}`;
    focusUpdated.textContent = `Updated: ${formatDate(project.pushedAt)}`;
    focusLink.href = project.url || "#";

    for (const child of carousel.children) {
      child.classList.remove("is-selected");
    }
    if (card) {
      card.classList.add("is-selected");
    }
  };

  carousel.innerHTML = "";
  projects.forEach((project, index) => {
    const card = document.createElement("button");
    card.className = "project-card";
    card.type = "button";
    card.role = "option";
    card.setAttribute("aria-label", `Select ${project.name}`);

    card.innerHTML = `
      <div class="project-image-frame">
        <img src="${project.imageUrl || FALLBACK_IMAGE}" alt="${project.name}">
      </div>
      <div class="project-caption">
        <h3>${project.name}</h3>
      </div>
    `;

    card.addEventListener("mouseenter", () => setFocus(project, card));
    card.addEventListener("focus", () => setFocus(project, card));
    card.addEventListener("click", () => setFocus(project, card));

    carousel.appendChild(card);
    if (index === 0) {
      setFocus(project, card);
    }
  });

  const scrollStep = () => Math.max(260, carousel.clientWidth * 0.6);
  prevButton.addEventListener("click", () => {
    carousel.scrollBy({ left: -scrollStep(), behavior: "smooth" });
  });

  nextButton.addEventListener("click", () => {
    carousel.scrollBy({ left: scrollStep(), behavior: "smooth" });
  });
};

const setupTryHackMe = async () => {
  const rankEl = document.getElementById("thm-rank");
  const roomsEl = document.getElementById("thm-rooms");
  const skillsCountEl = document.getElementById("thm-skill-count");
  const skillsListEl = document.getElementById("thm-skills-list");
  const roomsListEl = document.getElementById("thm-rooms-list");
  const syncEl = document.getElementById("thm-sync");
  const svg = document.getElementById("thm-star-svg");

  try {
    const response = await fetchJSONWithFallback("/api/tryhackme");
    if (!response.enabled) {
      syncEl.textContent = "TryHackMe integration disabled (set THM_USERNAME in backend .env).";
      drawSkillStar(svg, []);
      renderSkillsList(skillsListEl, []);
      renderRoomsList(roomsListEl, [], null);
      return;
    }

    const raw = response.data || response;
    const rank = extractRank(raw);
    const roomCount = extractRoomCount(raw);
    const rooms = extractCompletedRooms(raw);
    const skills = extractSkillEntries(raw);

    rankEl.textContent = String(rank);
    roomsEl.textContent = roomCount ?? (rooms.length || "Unknown");
    skillsCountEl.textContent = skills.length;

    drawSkillStar(svg, skills.slice(0, 5));
    renderSkillsList(skillsListEl, skills);
    renderRoomsList(roomsListEl, rooms, roomCount);
    syncEl.textContent = `Last synced: ${new Date().toLocaleString()}`;
  } catch (error) {
    rankEl.textContent = "Unavailable";
    roomsEl.textContent = "Unavailable";
    skillsCountEl.textContent = "0";
    drawSkillStar(svg, []);
    renderSkillsList(skillsListEl, []);
    renderRoomsList(roomsListEl, [], null);
    syncEl.textContent = `Sync failed: ${error.message}`;
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([setupProjects(), setupTryHackMe()]);
});
