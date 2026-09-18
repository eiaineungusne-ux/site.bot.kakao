const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require(process.env.JSDOM_MODULE || "jsdom");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

async function render(bot, transform = (s) => s, failure = false) {
  const dom = new JSDOM(read(`terms/${bot}/index.html`), {
    url: `https://kakaobot.xyz/terms/${bot}/`,
    runScripts: "outside-only",
  });
  const win = dom.window;
  win.console.error = () => {};
  win.fetch = async (url, options) => {
    assert.equal(url, `/terms/${bot}/readme.md`);
    assert.equal(options.cache, "no-store");
    if (failure) throw new Error("Network failure");
    return {
      ok: true,
      text: async () => transform(read(`terms/${bot}/readme.md`)),
    };
  };
  for (const name of [
    "vendor/marked.js",
    "vendor/purify.js",
    "vendor/js-yaml.js",
    "terms.js",
  ]) {
    win.eval(read(`assets/${name}`));
  }
  await new Promise((resolve) => setTimeout(resolve, 40));
  return dom;
}

(async () => {
  for (const bot of ["ventabot", "voidbot"]) {
    const dom = await render(bot);
    const doc = dom.window.document;
    assert.equal(doc.querySelector("article").dataset.loaded, "true");
    assert.equal(doc.querySelectorAll("#terms-content h2").length, 10);
    assert.equal(
      doc.querySelector('[aria-current="page"]').getAttribute("href"),
      `/terms/${bot}/`,
    );
    assert.equal(doc.getElementById("terms-status").hidden, true);
    assert(!doc.body.textContent.includes("{{"));
    dom.window.close();
  }
  let dom = await render(
    "ventabot",
    (text) =>
      text.replace(/updated:.*\n/, "updated: '2026-10-01'\n") +
      '\n## CMS update\n\n**Changed content**\n<script>window.hacked=1</script><img src=x onerror="window.hacked=1"><a href="javascript:alert(1)">bad link</a>',
  );
  assert(
    dom.window.document
      .getElementById("terms-dates")
      .textContent.includes("2026.10.01"),
  );
  assert.equal(
    dom.window.document.querySelectorAll("#terms-content h2").length,
    11,
  );
  assert.equal(
    dom.window.document.querySelector(
      '#terms-content script, #terms-content [onerror], #terms-content [href^="javascript:"]',
    ),
    null,
  );
  assert.equal(dom.window.hacked, undefined);
  dom.window.close();
  for (const [transform, failure] of [
    [(s) => "<html>SPA fallback</html>", false],
    [(s) => s, true],
    [(s) => s.replace("bot: ventabot", "bot: voidbot"), false],
  ]) {
    dom = await render("ventabot", transform, failure);
    assert.equal(
      dom.window.document.getElementById("terms-status").hidden,
      false,
    );
    assert.equal(
      dom.window.document.querySelectorAll("#terms-content h2").length,
      10,
    );
    dom.window.close();
  }
  for (const route of [
    "index.html",
    "ventabot/index.html",
    "voidbot/index.html",
    "terms/index.html",
    "terms/ventabot/index.html",
    "terms/voidbot/index.html",
  ]) {
    dom = new JSDOM(read(route));
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(
      doc.querySelector('body img[src*="og-image"], .hero-art'),
      null,
    );
    assert(
      doc
        .querySelector('meta[property="og:image"]')
        .content.includes("/og-image.png"),
    );
    for (const element of doc.querySelectorAll("[href], [src]")) {
      const url = element.getAttribute("href") || element.getAttribute("src");
      if (!url.startsWith("/")) continue;
      const target = url.split(/[?#]/)[0];
      assert(
        fs.existsSync(path.join(root, target)),
        `${route}: missing ${target}`,
      );
    }
    dom.window.close();
  }
  console.log(
    "PASS: both terms, CMS Markdown update, dates, sanitization, network/SPA/wrong-bot fallback, six page routes, links and preview-only heart",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
