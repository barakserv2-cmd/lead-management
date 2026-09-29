/* ברק שירותים — כל ה-JS של האתר. בלי ספריות ובלי סקריפטים של צד שלישי. */
(function () {
  "use strict";
  var cfg = window.BARAK_CONFIG || {};
  var qs = new URLSearchParams(location.search);

  function store(key, value) {
    try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch { return null; }
    return null;
  }

  // ── UTM: נשמר לכל הביקור כדי שהטופס ידווח מאיזה קמפיין הגיעו ──
  var utm = { source: qs.get("utm_source"), medium: qs.get("utm_medium"), campaign: qs.get("utm_campaign") };
  if (utm.source) store("barak_utm", JSON.stringify(utm));
  else { try { utm = JSON.parse(store("barak_utm")) || utm; } catch { /* ignore */ } }

  // ── קישורי וואטסאפ וחיוג ──
  function waHref(text) {
    return "https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(text || "היי, אשמח לשמוע על עבודה עם מגורים באילת");
  }
  var tel = "tel:" + String(cfg.phone || "").replace(/[^\d+]/g, "");
  document.querySelectorAll("[data-wa]").forEach(function (a) {
    if (cfg.whatsapp) a.href = waHref(a.getAttribute("data-wa"));
    else a.hidden = true;
  });
  document.querySelectorAll("[data-wa-alt]").forEach(function (el) { el.hidden = !!cfg.whatsapp; });
  document.querySelectorAll("[data-tel]").forEach(function (a) { a.href = tel; });

  // ── תפריט בטלפון ──
  var menuBtn = document.querySelector(".menu-btn");
  var nav = document.getElementById("nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ── הטופס ──
  var form = document.getElementById("apply-form");
  if (form) {
    var role = qs.get("role");
    var interest = form.elements.namedItem("interest");
    if (role && interest) {
      var opt = Array.prototype.find.call(interest.options, function (o) { return o.value === role; });
      if (!opt) { opt = new Option(role, role); interest.add(opt, 1); }
      interest.value = role;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var err = form.querySelector(".form-error");
      var name = f.namedItem("name").value.trim();
      var phone = f.namedItem("phone").value.replace(/[^\d+]/g, "");
      var problem = null;
      if (name.length < 2) problem = "נשמח לדעת איך קוראים לך.";
      else if (!/^(0\d{9}|\+?972\d{8,9})$/.test(phone)) problem = "מספר הטלפון לא נראה תקין. למשל: 050-1234567";
      else if (!f.namedItem("consent").checked) problem = "צריך לסמן את תיבת ההסכמה כדי שנוכל לחזור אליך.";
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      err.hidden = true;

      var data = {
        name: name, phone: phone,
        interest: f.namedItem("interest").value || null, start: f.namedItem("start").value || null,
        consent: true, consent_version: cfg.consentVersion || null,
        company: f.namedItem("company").value, page: location.pathname, utm: utm,
      };
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "שולחים…";

      var waText = "היי, אני " + name + ". ראיתי באתר ואשמח לפרטים" +
        (data.interest ? " על " + data.interest : "") + (data.start ? " (זמינות: " + data.start + ")" : "");

      function finish(sent) {
        form.hidden = true;
        var done = document.getElementById("apply-done");
        done.hidden = false;
        var wa = done.querySelector("[data-wa-done]");
        if (cfg.whatsapp) { wa.href = waHref(waText); wa.hidden = false; }
        done.querySelector("[data-sent]").hidden = !sent;
        done.querySelector("[data-not-sent]").hidden = sent;
        done.focus();
      }

      if (!cfg.crmUrl) { finish(false); return; }
      fetch(cfg.crmUrl.replace(/\/$/, "") + "/api/public/lead", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      })
        .then(function (r) { return r.json().then(function (j) { return r.ok && j.ok; }); })
        .catch(function () { return false; })
        .then(finish);
    });
  }

  // ── לוח המשרות: נטען חי מה-CRM ──
  var board = document.getElementById("jobs-board");
  if (board) {
    var status = document.getElementById("jobs-status");
    var chips = document.getElementById("jobs-chips");
    var limit = Number(board.getAttribute("data-limit")) || 0;
    var all = [];
    var active = "הכול";

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    function payText(p) {
      if (!p) return "שכר: בשיחה";
      return /^[\d.\-+ ]+$/.test(p) ? "₪" + p.replace(/\s/g, "") + " לשעה" : "שכר: " + p;
    }
    function render() {
      board.textContent = "";
      var list = all.filter(function (j) { return active === "הכול" || j.sector === active; });
      if (limit) list = list.slice(0, limit);
      list.forEach(function (j) {
        var card = el("article", "job");
        var top = el("div", "job-top");
        var head = el("div");
        head.appendChild(el("h3", null, j.title));
        head.appendChild(el("div", "where", j.location + (j.sector ? " · " + j.sector : "")));
        top.appendChild(head);
        if (j.urgent) top.appendChild(el("span", "badge", "דחוף"));
        card.appendChild(top);
        var tags = el("div", "tags");
        if (j.count > 1) tags.appendChild(el("span", "tag", j.count + " משרות"));
        tags.appendChild(el("span", "tag", "כולל מגורים"));
        (j.requirements || []).forEach(function (r) { tags.appendChild(el("span", "tag", r)); });
        card.appendChild(tags);
        var foot = el("div", "job-foot");
        foot.appendChild(el("span", "pay", payText(j.pay)));
        var go = el("a", "btn btn-primary btn-small", "אני רוצה את המשרה");
        go.href = cfg.whatsapp ? waHref("היי, אשמח לפרטים על המשרה: " + j.title) : "/?role=" + encodeURIComponent(j.title) + "#apply";
        foot.appendChild(go);
        card.appendChild(foot);
        board.appendChild(card);
      });
      if (status) status.textContent = list.length ? "" : "אין כרגע משרות פתוחות בתחום הזה. כתבו לנו ונמצא לכם משהו מתאים.";
    }
    function renderChips() {
      if (!chips) return;
      var sectors = ["הכול"];
      all.forEach(function (j) { if (j.sector && sectors.indexOf(j.sector) < 0) sectors.push(j.sector); });
      if (sectors.length < 3) return;
      sectors.forEach(function (s) {
        var b = el("button", "chip", s);
        b.type = "button";
        b.setAttribute("aria-pressed", s === active ? "true" : "false");
        b.addEventListener("click", function () {
          active = s;
          chips.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
          render();
        });
        chips.appendChild(b);
      });
    }

    function show(d) {
      all = d.jobs || [];
      var section = document.getElementById("live-jobs");
      if (!all.length) {
        if (section && section.hasAttribute("data-optional")) section.hidden = true;
        else if (status) status.textContent = "לא הצלחנו לטעון את המשרות כרגע. כתבו לנו ונספר לכם מה פתוח.";
        return;
      }
      if (section) section.hidden = false;
      renderChips();
      render();
    }

    // בלי CRM מחובר (תצוגה מקדימה) משתמשים ברשימה שב-config, אם יש
    if (!cfg.crmUrl) show({ jobs: cfg.jobs || [] });
    else {
      fetch(cfg.crmUrl.replace(/\/$/, "") + "/api/public/jobs")
        .then(function (r) { return r.ok ? r.json() : { jobs: [] }; })
        .catch(function () { return { jobs: [] }; })
        .then(show);
    }
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
