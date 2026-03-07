# Persona 5 Royal Thumbnail Prompts (Matched to Current Site Mapping)

Use this file as the source of truth for thumbnails that are currently wired in `frontend/src/main.jsx`.
All filenames below are exact and must be saved in `frontend/public/assets/project-art/`.

## Global style settings

- Style: anime illustration, high-contrast cel shading, dynamic comic framing
- Direction: Persona 5 Royal inspired visual language
- Palette: deep black `#070707`, crimson `#d90f1f`, gold `#f2c21a`, white accents
- Composition: diagonal cuts, layered UI shards, energetic motion lines
- Lighting: dramatic rim light, heavy shadow contrast
- Aspect ratio: `16:9`
- Output size: `1536x864` or `1920x1080`
- Rule: no text, no logos, no watermark

Negative prompt (reuse): photorealism, blurry image, washed colors, low contrast, watermark, text overlay, malformed anatomy, extra limbs

---

## 1) Green-Cart (featured)

- Repo: `https://github.com/COS301-SE-2025/Green-Cart`
- Filename: `green-cart-p5r.png`
- Prompt:
`Anime style eco-friendly ecommerce marketplace, sustainable grocery storefront, reusable packaging, green logistics and checkout flow, digital shopping UI with environmental impact indicators, Persona 5 Royal black red gold framing with subtle natural accents, cel-shaded, cinematic lighting, no text`

## 2) VScoders and the Jetbrainstormers (Team 4) (featured)

- Repo: `https://github.com/COS214-Project-2024/VScoders-and-the-Jetbrainstormers-Team-4`
- Filename: `citybuilder.png`
- Prompt:
`Anime style city-building strategy simulation control room, modular districts, transit lines, infrastructure overlays, system planning dashboard aesthetic, C++ university team project mood, Persona 5 Royal black red gold composition, sharp diagonal panel cuts, cel-shaded, high contrast, no text`

## 3) AssemblyWork

- Repo: `https://github.com/ShaydenNaidoo/AssemblyWork`
- Filename: `assemblywork-p5r.png`
- Prompt:
`Anime style low-level assembly coding lab, opcode streams, register map holograms, memory addresses and ALU circuitry, university computer architecture study mood, Persona 5 Royal black red gold visual language, bold diagonal framing, cel-shaded, high detail, cinematic lighting, no text`

## 4) COS-332-Computer-Networks

- Repo: `https://github.com/ShaydenNaidoo/COS-332-Computer-Networks`
- Filename: `cos-332-computer-networks-p5r.png`
- Prompt:
`Anime style computer networks practical arena, protocol-level packets moving between routers and terminals, scenes hinting HTTP CGI, telnet server, LDAP client, SMTP alarm simulator, POP3 triage and FTP auto uploader, low-level wire communication focus, Persona 5 Royal black red gold composition, sharp graphic panel cuts, cel-shaded, high contrast, no text`

## 5) COS214

- Repo: `https://github.com/ShaydenNaidoo/COS214`
- Filename: `cos214-p5r.png`
- Prompt:
`Anime style software design patterns workshop, modular C++ components snapping together like strategy units, UML diagram boards in the background, university software modelling practical aesthetic, Persona 5 Royal black red gold palette, angular comic composition, cel-shaded, dramatic shadows, no text`

## Optional mapped project

- Repo: `https://github.com/ShaydenNaidoo/portfolio-website`
- Filename: `portfolio-website-p5r.png`
- Prompt:
`Anime style personal portfolio command center, project cards, skill matrix radar, GitHub sync feed, full-stack dashboard energy, Persona 5 Royal black red gold style, aggressive diagonal comic layout, cel-shaded, cinematic contrast, no text`

---

## Important filename note

Do not use the old filename `cos301-computer-networks-p5r.png`.
Use `cos-332-computer-networks-p5r.png`.

## Import steps

1. Generate each image with the exact filename above.
2. Save files into `frontend/public/assets/project-art/`.
3. Build frontend:
   - `cd frontend`
   - `npm run build`
