import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("https://wordpress-1429673-6241585.cloudwaysapps.com/tent-meister-v18/", { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise(r => setTimeout(r, 3000));

  // Get DOM path from body to the first wp-block-group
  const pathResult = await page.evaluate(() => {
    const path: string[] = [];
    let el: Element | null = document.querySelector(".entry-content .wp-block-group");
    while (el && el !== document.body) {
      const cs = window.getComputedStyle(el);
      const w = Math.round(el.getBoundingClientRect().width);
      const tag = el.tagName.toLowerCase();
      const id = el.id ? "#" + el.id : "";
      const cls = el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 3).join(".") : "";
      path.unshift(`${tag}${id}${cls} [w=${w} mw=${cs.maxWidth} pad=${cs.paddingLeft}/${cs.paddingRight}]`);
      el = el.parentElement;
    }
    return path.join("\n -> ");
  });
  console.log("DOM path to first wp-block-group:");
  console.log(pathResult);

  // Check computed widths on key Divi containers
  const containerInfo = await page.evaluate(() => {
    const results: string[] = [];
    const selectors = [".container", "#page-container", "#main-content", "#left-area", "#content-area", ".entry-content", "article.page", ".et_pb_post_content"];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const cs = window.getComputedStyle(el);
        const w = Math.round(el.getBoundingClientRect().width);
        results.push(`${sel} -> w=${w} mw=${cs.maxWidth} ml=${cs.marginLeft} mr=${cs.marginRight} pad=${cs.paddingLeft}/${cs.paddingRight}`);
      } else {
        results.push(`${sel} -> NOT FOUND`);
      }
    }
    return results.join("\n");
  });
  console.log("\nContainer widths:");
  console.log(containerInfo);

  // Check if wp-block-group elements are full width
  const groupWidths = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll(".entry-content > .wp-block-group")).slice(0, 5);
    return groups.map((g, i) => {
      const w = Math.round(g.getBoundingClientRect().width);
      const cs = window.getComputedStyle(g);
      const h = g.querySelector("h1,h2,h3");
      const heading = h ? h.textContent?.trim().substring(0, 30) : "(no heading)";
      return `Group ${i}: "${heading}" w=${w} mw=${cs.maxWidth} bg=${cs.backgroundColor}`;
    }).join("\n");
  });
  console.log("\nFirst 5 wp-block-group elements:");
  console.log(groupWidths);

  await browser.close();
})();
