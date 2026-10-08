import { chromium, type Page } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";

const destination = path.resolve("docs/design/adie-adle-lookbook");
const baseUrl = process.env.LOOKBOOK_BASE_URL ?? "http://localhost:3027";
const entries = [
  { id: "generic", name: "Generic Word Lab", route: "generic_composer", url: "/dev/adle/common-word-lab", note: "Common Word Lab development fixture; the generic composer selects micro skills at runtime." },
  { id: "prefix", name: "Prefix Word Lab: un-", route: "dynamic_prefix_word_lab", url: "/dev/adle/prefix-word-lab?family=un", note: "Reviewed four-word un- package in the active learner lesson. Includes Discover, Cleaver Split, Meaning Sort, Build, Cover, Dictation and Reflection.", microSkill: "D4_MOR_PREFIXES_UN" },
  { id: "prefix-dis-mis", name: "Prefix Word Lab: dis- / mis-", route: "dynamic_prefix_word_lab", url: "/dev/adle/prefix-word-lab?family=dis-mis", note: "Reviewed dis- / mis- package in the active four-word lesson.", microSkill: "D4_MOR_PREFIXES_DIS_MIS" },
  { id: "prefix-in-family", name: "Prefix Word Lab: in- / im- / il- / ir-", route: "dynamic_prefix_word_lab", url: "/dev/adle/prefix-word-lab?family=in-family", note: "Reviewed in- family package with its extra Split and Build rounds.", microSkill: "D4_MOR_PREFIXES_IN_IM_IL_IR" },
  { id: "prefix-re-pre", name: "Prefix Word Lab: re- / pre-", route: "dynamic_prefix_word_lab", url: "/dev/adle/prefix-word-lab?family=re-pre", note: "Reviewed re- / pre- package in the active four-word lesson.", microSkill: "D4_MOR_PREFIXES_RE_PRE" },
  { id: "prefix-sub-inter-super", name: "Prefix Word Lab: sub- / inter- / super-", route: "dynamic_prefix_word_lab", url: "/dev/adle/prefix-word-lab?family=sub-inter-super", note: "Reviewed sub- / inter- / super- package with three Split rounds.", microSkill: "D4_MOR_PREFIXES_SUB_INTER_SUPER" },
  { id: "suffix", name: "Suffix Word Lab", route: "dynamic_affix_word_lab", url: "/dev/adle/dynamic-affix-v3", note: "Reviewed -ment suffix package rendered by the active affix lesson component." },
  { id: "base", name: "Base word families", route: "base_word_lab", url: "/dev/adle/base-word-family", note: "Reviewed-content-shaped local lesson fixture." },
  { id: "compound", name: "Compound words", route: "compound_word_lab", url: "/dev/adle/compound-word", note: "Local fixture of the active compound lesson renderer." },
  { id: "ing", name: "-ing endings", route: "ing_endings_word_lab", url: "/dev/adle/ing-endings", note: "Development fixture with unapproved example content; no learner data is written." },
  { id: "comparison", name: "Comparatives and superlatives", route: "comparative_superlative_word_lab", url: "/dev/adle/comparative-superlative", note: "Development fixture with unapproved example content; no learner data is written." },
  { id: "review", name: "Review and reflection", route: null, url: "/dev/adle/review-conundrum", note: "Review Writing Challenge fixture; review covers eligible skills rather than a fixed micro-skill list." },
] as const;
type Capture = { entry: string; theme: string; device: string; state: string; file: string; source: string };
const captures: Capture[] = [];

async function take(page: Page, entry: string, theme: string, device: string, state: string, source: string) {
  const file = `screenshots/${entry}-${theme}-${device}-${state}.png`;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(destination, file), fullPage: true, animations: "disabled" });
  captures.push({ entry, theme, device, state, file, source });
}

async function main() {
  await mkdir(path.join(destination, "screenshots"), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const entry of entries) {
      for (const theme of ["light", "dark"]) {
        for (const device of ["desktop", "mobile"]) {
          const context = await browser.newContext({ viewport: device === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
          await context.addInitScript((value) => localStorage.setItem("scarlett-theme-v1", value), theme);
          const page = await context.newPage();
          const response = await page.goto(baseUrl + entry.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          if (!response?.ok()) throw new Error(`${entry.id}: ${response?.status()}`);
          await page.locator("body").waitFor();
          if (entry.id !== "generic" && entry.id !== "review") await page.locator(".word-lab-scene").waitFor({ state: "visible", timeout: 30_000 });
          await page.waitForTimeout(350);
          await take(page, entry.id, theme, device, entry.id === "generic" || entry.id === "review" ? "activity" : "teaching", entry.url);
          if (["base", "suffix", "ing", "comparison"].includes(entry.id)) {
            await page.getByRole("button", { name: "Next page" }).click();
            await take(page, entry.id, theme, device, "reading-examples", "Second teaching page in local lesson fixture");
          }
          if (["suffix", "base", "compound", "ing", "comparison"].includes(entry.id) || entry.route === "dynamic_prefix_word_lab") {
            const start = page.getByRole("button", { name: "Start the activities" });
            for (let step = 0; step < 12 && !(await start.isVisible().catch(() => false)); step += 1) {
              const next = page.getByRole("button", { name: "Next page" });
              if (await next.isVisible().catch(() => false)) await next.click({ noWaitAfter: true });
              await page.waitForTimeout(100);
            }
            await start.waitFor({ state: "visible", timeout: 8_000 });
            await start.click({ noWaitAfter: true });
            if (entry.id === "compound") await page.getByRole("heading", { name: "Build all the words" }).waitFor({ timeout: 10_000 });
            else if (entry.route === "dynamic_prefix_word_lab") await page.getByRole("button", { name: /^Add / }).waitFor({ timeout: 10_000 });
            else await page.waitForTimeout(300);
            await page.waitForTimeout(250);
            await take(page, entry.id, theme, device, "activity", "First activity after teaching in local lesson fixture");
          }
          if (entry.id === "ing") {
            for (const task of ["meaning", "scrabble", "cleaver", "dictation"] as const) {
              await page.goto(baseUrl + `/dev/adle/ing-endings?task=${task}`, { waitUntil: "domcontentloaded" });
              await page.locator(".word-lab-scene").waitFor({ state: "visible", timeout: 30_000 });
              const taskSelector = { meaning: ".meaning-match-board", scrabble: ".scrabble-slots", cleaver: ".cleaver-letters", dictation: ".hear-word-button" }[task];
              await page.locator(taskSelector).waitFor({ state: "visible", timeout: 15_000 });
              await take(page, entry.id, theme, device, task, `Focused -ing ${task} fixture`);
            }
          }
          if (entry.id === "review") {
            const spin = page.getByRole("button", { name: "SPIN" });
            if (await spin.count()) {
              await spin.click();
              await page.waitForTimeout(3600);
              await take(page, entry.id, theme, device, "feedback", "Review challenge selected by local fixture wheel");
            }
          }
          if (entry.id === "prefix") {
            const meanings: Record<string, string> = { unhappy: "not happy", unfair: "not fair", unkind: "not kind", unlock: "reverse the lock" };
            for (let index = 0; index < 4; index += 1) {
              await page.getByRole("button", { name: "Add un-" }).click();
              const text = await page.locator(".word-lab-workspace").innerText();
              const word = text.match(/What does (\w+) mean\?/)?.[1];
              if (!word || !meanings[word]) throw new Error(`Unrecognised prefix discovery word: ${word}`);
              await page.getByRole("button", { name: meanings[word], exact: true }).click();
              if (index === 0) await take(page, entry.id, theme, device, "feedback", "Correct meaning feedback in active prefix lesson");
              await page.getByRole("button", { name: index < 3 ? "Try another word" : "Find the word parts" }).click();
            }
            await page.locator(".cleaver-letters").waitFor({ state: "visible", timeout: 10_000 });
            await take(page, entry.id, theme, device, "cleaver", "Prefix boundary activity in active lesson");
            await page.getByRole("button", { name: /Split at boundary 2\. Split between un and happy/ }).click();
            await page.getByRole("button", { name: "Continue to meanings" }).waitFor({ state: "visible", timeout: 10_000 });
            await take(page, entry.id, theme, device, "cleaver-feedback", "Correct prefix split feedback");
            await page.getByRole("button", { name: "Continue to meanings" }).click();
            await page.getByText("Read the word. Think about what the prefix means.", { exact: false }).waitFor({ timeout: 10_000 });
            await take(page, entry.id, theme, device, "meaning", "Prefix Meaning Sort in active lesson");
            for (const [index, word] of ["unhappy", "unfair", "unkind", "unlock"].entries()) {
              await page.locator("[data-testid=bin-sort-active]").getByText(`Word ${index + 1} of 4`).waitFor();
              await page.getByRole("button", { name: new RegExp(`^${word === "unlock" ? "REVERSE" : "NOT"}`) }).click();
            }
            await page.locator("[data-definition-word-builder]").waitFor({ state: "visible", timeout: 10_000 });
            await take(page, entry.id, theme, device, "build", "Prefix Build in active lesson");
            await page.getByRole("button", { name: "un-", exact: true }).click();
            await page.getByRole("button", { name: /Place un- in block 1/ }).click();
            await page.getByRole("button", { name: "Check my word" }).click();
            await page.getByRole("button", { name: "Remember the lesson words" }).click();
            for (const [index, word] of ["unhappy", "unfair", "unkind", "unlock"].entries()) {
              await page.locator("[data-cover-state=look]").waitFor({ state: "visible", timeout: 10_000 });
              if (index === 0) await take(page, entry.id, theme, device, "cover", "Prefix Cover Check in active lesson");
              await page.getByRole("button", { name: /Slide the cover from left to right/ }).press("ArrowRight");
              await page.getByRole("textbox", { name: "Type the whole word" }).fill(word);
              await page.getByRole("button", { name: "Check", exact: true }).click();
              await page.getByRole("button", { name: "Continue", exact: true }).click();
            }
            const sentences = [
              "The lost child felt unhappy and began to cry.",
              "It was unfair when one child had three turns and another had none.",
              "It is unkind to leave someone out.",
              "Please unlock the door with the silver key.",
            ];
            for (const [index, sentence] of sentences.entries()) {
              await page.getByRole("button", { name: "Check sentence" }).waitFor({ state: "visible", timeout: 10_000 });
              if (index === 0) await take(page, entry.id, theme, device, "dictation", "Prefix sentence dictation in active lesson");
              await page.getByRole("textbox", { name: /Write the whole sentence/ }).fill(sentence);
              await page.getByRole("button", { name: "Check sentence" }).click();
              await page.getByRole("button", { name: index < 3 ? "Next sentence" : "See what you discovered" }).click();
            }
            await page.getByRole("button", { name: "Finish the Word Lab" }).waitFor({ state: "visible", timeout: 10_000 });
            await take(page, entry.id, theme, device, "reflection", "Prefix reflection in active lesson");
            await page.locator("textarea").last().fill("I learned that un- can mean not or reverse.");
            await page.getByRole("button", { name: "Finish the Word Lab" }).click();
            await page.getByText("un- Word Lab complete").waitFor({ state: "visible", timeout: 10_000 });
            await take(page, entry.id, theme, device, "ending", "Local completion; no lesson result submitted");
          }
          await context.close();
          process.stdout.write(`${entry.id} ${theme} ${device}\n`);
        }
      }
    }
  } finally { await browser.close(); }

  const catalogue = JSON.parse(await readFile("docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json", "utf8")) as { micro_skill_key: string; display_name: string }[];
  const specialistKeys = new Set(ADLE_CURRICULUM_ROUTE_REGISTRY.flatMap(route => route.supportedMicroSkillKeys));
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "Local development fixtures and route registry. Screens are actual browser captures; fixture content is not production activation evidence.",
    entries: entries.map(entry => ({ ...entry, microSkills: "microSkill" in entry ? [entry.microSkill] : entry.route === null ? [] : ADLE_CURRICULUM_ROUTE_REGISTRY.find(route => route.routeId === entry.route)?.supportedMicroSkillKeys ?? [] })),
    captures,
    otherCatalogueSkills: catalogue.filter(skill => !specialistKeys.has(skill.micro_skill_key)).map(skill => ({ key: skill.micro_skill_key, name: skill.display_name, label: "No distinct specialist lesson implemented; generic composer eligibility is checked separately" })),
  };
  await writeFile(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const safe = JSON.stringify(manifest).replaceAll("<", "\\u003c");
  await writeFile(path.join(destination, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adie ADLE lesson lookbook</title><style>
  :root{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff8fc;color:#172039}*{box-sizing:border-box}body{margin:0}header{padding:2rem clamp(1rem,4vw,4rem);background:linear-gradient(130deg,#fff,#ffe5f3);border-bottom:1px solid #f2cade}h1{margin:.3rem 0;font-size:clamp(2rem,4vw,3.5rem)}h2{margin:0}.eyebrow{font-size:.72rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#b60062}.intro{max-width:70ch;line-height:1.5}.toolbar{display:flex;flex-wrap:wrap;gap:.8rem;padding:1rem clamp(1rem,4vw,4rem);position:sticky;top:0;background:#fff9fdeb;border-bottom:1px solid #f2cade;z-index:2}select{padding:.7rem;border:1px solid #c882ab;border-radius:.7rem;background:white;color:#172039;font:inherit}main{padding:1.5rem clamp(1rem,4vw,4rem);display:grid;gap:1.5rem}.card{border:1px solid #f2cade;border-radius:1.4rem;padding:1.25rem;background:white;box-shadow:0 12px 35px #e42c8d12}.card p{line-height:1.5}.skills{display:flex;flex-wrap:wrap;gap:.35rem;padding:0;list-style:none}.skills li{padding:.35rem .55rem;border-radius:.5rem;background:#fff0f8;font-size:.7rem;overflow-wrap:anywhere}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:1rem}.shot{display:block;text-decoration:none;color:inherit;border:1px solid #ead4e2;border-radius:1rem;overflow:hidden;background:#f9f2f8}.shot img{display:block;width:100%;height:260px;object-fit:cover;object-position:top}.shot span{display:block;padding:.6rem;font-size:.8rem;font-weight:800}.empty{color:#6b5365}details{margin:1.5rem clamp(1rem,4vw,4rem);padding:1.25rem;border:1px solid #f2cade;border-radius:1rem;background:white}details summary{cursor:pointer;font-weight:800}.index{columns:3;line-height:1.7;font-size:.8rem}@media(max-width:700px){.index{columns:1}.shot img{height:210px}}
  </style></head><body><header><p class="eyebrow">ADLE design review · Adie</p><h1>Lesson lookbook</h1><p class="intro">Real local fixture screenshots in the same light and dark design. Each card maps to a distinct lesson experience. Screenshots show interface states, not release approval or proof that a micro skill is active for assignment.</p><p><a href="desktop-fit/index.html">Review short desktop screens at 1280 × 720</a></p></header><div class="toolbar"><label>Lesson <select id="entry"><option value="all">All lessons</option></select></label><label>Theme <select id="theme"><option value="all">Both themes</option><option>light</option><option>dark</option></select></label><label>Device <select id="device"><option value="all">Both devices</option><option>desktop</option><option>mobile</option></select></label><label>State <select id="state"><option value="all">All captured states</option><option>teaching</option><option>reading-examples</option><option>activity</option><option>meaning</option><option>build</option><option>cover</option><option>scrabble</option><option>cleaver</option><option>cleaver-feedback</option><option>dictation</option><option>feedback</option><option>reflection</option><option>ending</option></select></label></div><main id="gallery"></main><details><summary>Other catalogue micro skills without a specialist screen in this lookbook</summary><p>This index lists catalogue skills that are outside the declared specialist route coverage. The generic composer may select eligible skills at runtime; this gallery does not claim that each one is assigned or activated.</p><div id="other" class="index"></div></details><script>const data=${safe};const qs=id=>document.getElementById(id);const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));qs('entry').innerHTML+=""+data.entries.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+'</option>').join('');qs('other').innerHTML=data.otherCatalogueSkills.map(s=>'<div title="'+esc(s.key)+'">'+esc(s.name)+'</div>').join('');function render(){const selected=Object.fromEntries(['entry','theme','device','state'].map(k=>[k,qs(k).value]));qs('gallery').innerHTML=data.entries.filter(e=>selected.entry==='all'||selected.entry===e.id).map(e=>{const shots=data.captures.filter(c=>c.entry===e.id&&['theme','device','state'].every(k=>selected[k]==='all'||selected[k]===c[k]));return '<section class="card"><p class="eyebrow">'+esc(e.id)+'</p><h2>'+esc(e.name)+'</h2><p>'+esc(e.note)+'</p><p><strong>Declared micro skills:</strong> '+(e.microSkills.length?e.microSkills.length:'Runtime selected or review eligible')+'</p><ul class="skills">'+e.microSkills.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul><div class="shots">'+(shots.length?shots.map(c=>'<a class="shot" href="'+esc(c.file)+'" target="_blank"><img loading="lazy" src="'+esc(c.file)+'" alt="'+esc(e.name+' '+c.theme+' '+c.device+' '+c.state)+'"><span>'+esc(c.theme+' · '+c.device+' · '+c.state)+'</span></a>').join(''):'<p class="empty">No capture for this filter.</p>')+'</div></section>'}).join('')}for(const k of ['entry','theme','device','state'])qs(k).addEventListener('change',render);render();</script></body></html>`);
  process.stdout.write(`Saved ${captures.length} real screenshots to ${destination}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
