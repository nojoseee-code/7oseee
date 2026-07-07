// ============================================================
// EDIT THESE TWO LINES before publishing the site:
// ============================================================
const DISCORD_INVITE_URL = "https://discord.gg/your-invite-code"; // your real Discord invite
const BOT_API_BASE = "http://localhost:3000"; // your bot's public address (see README "Connecting the website to the bot")
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // Wire up every Discord button/link on the page
  document.querySelectorAll("#discordLink, .discord-link").forEach((el) => {
    el.href = DISCORD_INVITE_URL;
  });

  const input = document.getElementById("licenseKeyInput");
  const btn = document.getElementById("checkBtn");
  const resultBox = document.getElementById("lookupResult");

  async function checkLicense() {
    const key = input.value.trim();
    if (!key) {
      input.focus();
      return;
    }

    resultBox.classList.remove("hidden", "success", "error");
    resultBox.textContent = "جاري التحقق...";

    try {
      const res = await fetch(`${BOT_API_BASE}/api/verify?key=${encodeURIComponent(key)}`);
      const data = await res.json();

      if (data.valid) {
        resultBox.classList.add("success");
        resultBox.innerHTML =
          `✅ ترخيص فعّال — <strong>${escapeHtml(data.product)}</strong><br>` +
          `IP المسجّل: ${data.ip ? escapeHtml(data.ip) : "غير محدد بعد"}`;
      } else if (data.error === "not_found") {
        resultBox.classList.add("error");
        resultBox.textContent = "❌ ما لقينا هذا المفتاح. تأكد إنك نسخته صح.";
      } else {
        resultBox.classList.add("error");
        resultBox.innerHTML = `❌ الترخيص غير فعّال حالياً (${escapeHtml(data.status || "unknown")}).`;
      }
    } catch (err) {
      resultBox.classList.add("error");
      resultBox.textContent = "⚠️ تعذر الاتصال بالسيرفر. تأكد إن البوت شغّال وإن BOT_API_BASE مضبوط صح.";
    }
  }

  btn.addEventListener("click", checkLicense);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkLicense();
  });
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
