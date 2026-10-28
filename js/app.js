(function () {
  "use strict";

  var CFG = window.KINONIA_CONFIG;
  var CATS = window.KINONIA_CATEGORIES;
  var CLUBS = window.KINONIA_CLUBS;
  var DAYS = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  var DAYS_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var byId = {};
  CLUBS.forEach(function (c) { byId[c.id] = c; });

  function fullTitle(c) { return c.name ? c.title + " «" + c.name + "»" : c.title; }
  function timeRange(s) { return s.to ? s.from + "–" + s.to : s.from; }
  function whenText(c) {
    if (!c.slots.length) return c.flex;
    if (c.id === "family-classes") return "Пн–Пт, учебный день";
    var groups = {};
    c.slots.forEach(function (s) {
      var key = timeRange(s) + (s.note ? " (" + s.note + ")" : "");
      (groups[key] = groups[key] || []).push(DAYS_SHORT[s.day]);
    });
    var out = Object.keys(groups).map(function (k) { return groups[k].join(", ") + " " + k; });
    if (c.flex) out.push(c.flex);
    return out.join("; ");
  }

  /* ---------- Hero: кольцо и буквы ---------- */
  var ringText = $("#ringText");
  var names = CLUBS.map(function (c) { return c.name || c.title; });
  ringText.textContent = names.join("  ✦  ") + "  ✦  ";
  // подгоняем кегль, чтобы названия ровно обошли круг и не наползали друг на друга
  var ringEl = $(".ring__text"), circ = 2 * Math.PI * 410;
  try {
    var len = ringText.getComputedTextLength();
    if (len > 0) ringEl.style.fontSize = Math.min(25, 25 * (circ * .985) / len) + "px";
  } catch (e) {}
  // точки-пигменты на внешнем круге
  var dots = $("#ringDots");
  Object.keys(CATS).forEach(function (k, i, arr) {
    var a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
    var el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    el.setAttribute("cx", 500 + Math.cos(a) * 455);
    el.setAttribute("cy", 500 + Math.sin(a) * 455);
    el.setAttribute("r", 7);
    el.style.fill = CATS[k].color;
    dots.appendChild(el);
  });

  var title = $(".split");
  title.innerHTML = title.textContent.split("").map(function (ch) { return '<span class="ch" aria-hidden="true">' + ch + "</span>"; }).join("");

  if (window.gsap && !reduce) {
    var tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    var lines = $$(".ring__line");
    lines.forEach(function (l) { var r = +l.getAttribute("r"); var len = 2 * Math.PI * r; l.style.strokeDasharray = len; l.style.strokeDashoffset = len; });
    tl.to(lines, { strokeDashoffset: 0, duration: 2.4, stagger: .18, ease: "power2.inOut" }, 0)
      .from(".ring__text, .ring__greek", { opacity: 0, duration: 2 }, .9)
      .from(".ring__dots circle", { scale: 0, transformOrigin: "center", duration: 1, stagger: .08, ease: "back.out(3)" }, 1.4)
      .from(".split .ch", { yPercent: 110, opacity: 0, rotate: 6, duration: 1.4, stagger: .06 }, .35)
      .from(".hero__kicker, .hero__gloss, .hero__lead, .hero__cta, .hero__scroll", { y: 18, opacity: 0, duration: 1.2, stagger: .1 }, 1)
      .from(".bar", { y: -20, opacity: 0, duration: 1 }, 1.4);
    // лёгкий параллакс кольца за курсором
    var ring = $(".hero__ring");
    window.addEventListener("pointermove", function (e) {
      var x = (e.clientX / innerWidth - .5) * 18, y = (e.clientY / innerHeight - .5) * 18;
      gsap.to(ring, { x: x, y: y, duration: 1.6, ease: "power3.out", overwrite: "auto" });
    }, { passive: true });
  }

  var bar = $("#bar");
  var onScroll = function () { bar.classList.toggle("is-solid", scrollY > innerHeight * .6); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- Фильтры ---------- */
  var state = { who: "any", cat: "any", day: 0 };
  var fCat = $("#fCat");
  fCat.innerHTML = '<button class="chip is-on" data-cat="any">Все направления</button>' +
    Object.keys(CATS).map(function (k) {
      return '<button class="chip" data-cat="' + k + '" style="--c:' + CATS[k].color + '" title="' + CATS[k].pigment + '"><i></i>' + CATS[k].name + "</button>";
    }).join("");
  var fDay = $("#fDay");
  fDay.innerHTML = '<button class="chip is-on" data-day="0">Любой день</button>' +
    [1,2,3,4,5,6,7].map(function (d) { return '<button class="chip" data-day="' + d + '" aria-label="' + DAYS[d] + '">' + DAYS_SHORT[d] + "</button>"; }).join("");

  function bindGroup(root, attr, key) {
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-" + attr + "]"); if (!b) return;
      $$("[data-" + attr + "]", root).forEach(function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-checked", x === b); });
      var v = b.getAttribute("data-" + attr);
      state[key] = key === "day" ? +v : v;
      render();
    });
  }
  bindGroup($("#fWho"), "who", "who");
  bindGroup(fCat, "cat", "cat");
  bindGroup(fDay, "day", "day");
  $("#reset").addEventListener("click", function () {
    [["#fWho","who","any"],["#fCat","cat","any"],["#fDay","day","0"]].forEach(function (g) {
      $("[data-" + g[1] + '="' + g[2] + '"]', $(g[0])).click();
    });
  });

  function matches(c) {
    if (state.who === "kids" && c.who === "adults") return false;
    if (state.who === "adults" && c.who === "kids") return false;
    if (state.cat !== "any" && c.cat !== state.cat) return false;
    if (state.day && !c.slots.some(function (s) { return s.day === state.day; })) return false;
    return true;
  }

  /* ---------- Каталог ---------- */
  var list = $("#list");
  list.innerHTML = CLUBS.map(function (c) {
    var cat = CATS[c.cat];
    return '<li class="row" data-id="' + c.id + '" style="--c:' + cat.color + '">' +
      '<button class="row__head" aria-expanded="false" aria-controls="d-' + c.id + '">' +
        '<span class="dab" title="' + cat.pigment + ' — ' + cat.name + '"></span>' +
        '<span class="row__title">' + esc(c.title) + (c.name ? "<small>«" + esc(c.name) + "»</small>" : "") + "</span>" +
        '<span class="row__when">' + esc(whenText(c)) + "</span>" +
        '<span class="row__age">' + esc(c.age) + "</span>" +
        '<span class="row__plus" aria-hidden="true"></span>' +
      "</button>" +
      '<div class="row__body" id="d-' + c.id + '"><div class="row__inner"><div class="detail">' +
        '<p class="detail__desc">' + esc(c.desc) + "</p>" +
        '<div class="detail__side"><dl>' +
          "<div><dt>Ведёт</dt><dd>" + esc(c.teacher) + (c.teacherNote ? '<br><span style="color:var(--ink-2)">' + esc(c.teacherNote) + "</span>" : "") + "</dd></div>" +
          "<div><dt>Расписание</dt><dd>" + esc(whenText(c)) + "</dd></div>" +
          "<div><dt>Пожертвование</dt><dd>" + esc(c.price || "уточните у администратора") + "</dd></div>" +
        "</dl>" +
        '<div class="detail__act"><button class="btn btn--ink btn--sm" data-signup="' + c.id + '">Записаться</button>' +
          (c.phone ? '<a class="btn btn--ghost-ink btn--sm" href="tel:' + c.phone.replace(/[^\d+]/g, "") + '">Позвонить педагогу</a>' : "") +
        "</div></div>" +
      "</div></div></div></li>";
  }).join("");

  list.addEventListener("click", function (e) {
    var h = e.target.closest(".row__head"); if (!h) return;
    var row = h.parentNode, open = !row.classList.contains("is-open");
    row.classList.toggle("is-open", open);
    h.setAttribute("aria-expanded", open);
  });

  function render() {
    var n = 0;
    $$(".row", list).forEach(function (row) {
      var ok = matches(byId[row.dataset.id]);
      if (ok) {
        n++;
        if (row.hidden) { row.hidden = false; row.classList.add("is-out"); requestAnimationFrame(function () { requestAnimationFrame(function () { row.classList.remove("is-out"); }); }); }
      } else { row.hidden = true; row.classList.remove("is-open"); }
    });
    $("#count").textContent = n === CLUBS.length ? "Все " + n + " занятий" : "Подходит: " + n + " " + plural(n, ["занятие", "занятия", "занятий"]);
    $("#empty").hidden = n > 0;
  }
  function plural(n, f) { var m = n % 10, h = n % 100; return f[m === 1 && h !== 11 ? 0 : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 1 : 2]; }
  render();

  /* ---------- Неделя ---------- */
  var grid = $("#grid");
  var html = "";
  for (var d = 1; d <= 7; d++) {
    var items = [];
    CLUBS.forEach(function (c) { c.slots.forEach(function (s) { if (s.day === d) items.push({ c: c, s: s }); }); });
    items.sort(function (a, b) { return a.s.from < b.s.from ? -1 : 1; });
    html += '<div class="day"><div class="day__name">' + DAYS[d] + "<small>" + items.length + " " + plural(items.length, ["занятие", "занятия", "занятий"]) + "</small></div>" +
      items.map(function (it) {
        return '<button class="slot" data-club="' + it.c.id + '" style="--c:' + CATS[it.c.cat].color + '"><b>' + timeRange(it.s) + "</b><span>" + esc(it.c.name || it.c.title) + (it.s.note ? " · " + esc(it.s.note) : "") + "</span></button>";
      }).join("") + "</div>";
  }
  grid.innerHTML = html;
  grid.addEventListener("pointerover", function (e) {
    var s = e.target.closest(".slot");
    if (!s) return;
    grid.classList.add("is-hl");
    $$(".slot", grid).forEach(function (x) { x.classList.toggle("is-hl", x.dataset.club === s.dataset.club); });
  });
  grid.addEventListener("pointerleave", function () { grid.classList.remove("is-hl"); });
  grid.addEventListener("click", function (e) { var s = e.target.closest(".slot"); if (s) openSheet(s.dataset.club); });

  $("#flexList").innerHTML = CLUBS.filter(function (c) { return !c.slots.length; }).map(function (c) {
    return '<li><button data-signup="' + c.id + '" style="--c:' + CATS[c.cat].color + '"><i></i>' + esc(fullTitle(c)) + "</button></li>";
  }).join("");

  /* ---------- Контакты ---------- */
  $("#addr").textContent = CFG.address;
  $("#hours").textContent = CFG.hours;
  $("#admin").innerHTML = esc(CFG.adminName) + ', <a href="tel:+' + CFG.adminPhoneRaw + '">' + esc(CFG.adminPhone) + "</a>";
  $("#links").innerHTML =
    '<a class="btn btn--ink btn--sm" href="https://wa.me/' + CFG.adminPhoneRaw + '" target="_blank" rel="noopener">WhatsApp</a>' +
    '<a class="btn btn--ghost-ink btn--sm" href="https://t.me/+' + CFG.adminPhoneRaw + '" target="_blank" rel="noopener">Telegram</a>' +
    '<a class="btn btn--ghost-ink btn--sm" href="https://yandex.ru/maps/?text=' + encodeURIComponent("Химки, Сходня, Первомайская улица, 9") + '" target="_blank" rel="noopener">Маршрут</a>';
  if (CFG.botUsername) { var bl = $("#botLink"); bl.href = "https://t.me/" + CFG.botUsername + "?start=catalog"; bl.hidden = false; }

  /* ---------- Форма записи ---------- */
  var sheet = $("#sheet"), form = $("#form"), done = $("#done"), sel = $("#fClub"), lastFocus;
  sel.innerHTML = '<option value="">Помогите выбрать</option>' +
    Object.keys(CATS).map(function (k) {
      return '<optgroup label="' + CATS[k].name + '">' + CLUBS.filter(function (c) { return c.cat === k; }).map(function (c) {
        return '<option value="' + c.id + '">' + esc(fullTitle(c)) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");

  function openSheet(id) {
    lastFocus = document.activeElement;
    form.hidden = false; done.hidden = true; done.classList.remove("is-on"); $("#fail").hidden = true;
    if (id !== undefined) sel.value = byId[id] ? id : "";
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add("is-open"); }); });
    setTimeout(function () { (sel.value ? form.elements.student : sel).focus({ preventScroll: true }); }, 350);
  }
  function closeSheet() {
    sheet.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(function () { sheet.hidden = true; if (lastFocus) lastFocus.focus({ preventScroll: true }); }, reduce ? 0 : 450);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-signup]");
    if (b) { e.preventDefault(); openSheet(b.getAttribute("data-signup") || ""); return; }
    if (e.target.closest("[data-close]")) closeSheet();
  });
  document.addEventListener("keydown", function (e) {
    if (sheet.hidden) return;
    if (e.key === "Escape") closeSheet();
    if (e.key === "Tab") { // держим фокус внутри шторки
      var f = $$("button, a[href], input:not(.hp), select, textarea", $(".sheet__panel")).filter(function (x) { return x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // кому заниматься → подпись поля
  form.addEventListener("change", function (e) {
    if (e.target.name !== "forWhom") return;
    var self = e.target.value === "Я сам(а)";
    $("#studentField").style.display = self ? "none" : "";
    $("#studentField span").textContent = e.target.value === "Всей семьёй" ? "Кто ещё придёт" : "Имя ученика";
  });

  // маска телефона
  var phone = form.elements.phone;
  phone.addEventListener("input", function () {
    var d = phone.value.replace(/\D/g, "");
    if (d[0] === "8" || d[0] === "7") d = d.slice(1);
    d = d.slice(0, 10);
    var out = "+7";
    if (d.length) out += " " + d.slice(0, 3);
    if (d.length > 3) out += " " + d.slice(3, 6);
    if (d.length > 6) out += "-" + d.slice(6, 8);
    if (d.length > 8) out += "-" + d.slice(8, 10);
    phone.value = out;
  });
  phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+7 "; });

  function validate() {
    var ok = true;
    var nameF = form.elements.name.closest(".field");
    var nm = form.elements.name.value.trim().length >= 2;
    nameF.classList.toggle("is-bad", !nm); ok = ok && nm;
    var ph = phone.value.replace(/\D/g, "").length === 11;
    phone.closest(".field").classList.toggle("is-bad", !ph); ok = ok && ph;
    var cs = form.elements.consent.checked;
    $(".field__err--check").classList.toggle("is-on", !cs); ok = ok && cs;
    if (!ok) { var bad = $(".is-bad input", form) || form.elements.consent; bad.focus(); }
    return ok;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements.website.value) return; // бот-ловушка
    if (!validate()) return;
    var c = byId[sel.value];
    var data = {
      source: "site",
      clubId: sel.value || "",
      club: c ? fullTitle(c) : "Помочь с выбором",
      forWhom: form.elements.forWhom.value,
      student: form.elements.student.value.trim(),
      age: form.elements.age.value.trim(),
      name: form.elements.name.value.trim(),
      phone: phone.value,
      contact: form.elements.contact.value,
      comment: form.elements.comment.value.trim()
    };
    var btn = $("#submit");
    btn.disabled = true; btn.textContent = "Отправляем…";

    if (!CFG.endpoint) { // запасной путь, пока сервер не подключён
      btn.disabled = false; btn.textContent = "Отправить заявку";
      window.open("https://wa.me/" + CFG.adminPhoneRaw + "?text=" + encodeURIComponent(message(data)), "_blank", "noopener");
      showDone(data, null, true);
      return;
    }

    fetch(CFG.endpoint, { method: "POST", body: JSON.stringify(data) }) // text/plain — без preflight
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || "fail");
        showDone(data, res.id, false);
      })
      .catch(function () {
        var f = $("#fail");
        f.hidden = false;
        f.innerHTML = 'Заявка не отправилась: нет связи с сервером. Проверьте интернет и нажмите ещё раз или <a href="https://wa.me/' + CFG.adminPhoneRaw + "?text=" + encodeURIComponent(message(data)) + '" target="_blank" rel="noopener">отправьте её в WhatsApp</a>.';
      })
      .finally(function () { btn.disabled = false; btn.textContent = "Отправить заявку"; });
  });

  function message(d) {
    return "Здравствуйте! Хочу записаться в «Кинонию».\n" +
      "Занятие: " + d.club + "\n" +
      "Кто занимается: " + d.forWhom + (d.student ? ", " + d.student : "") + (d.age ? ", " + d.age + " лет" : "") + "\n" +
      "Контакт: " + d.name + ", " + d.phone + " (" + d.contact + ")" +
      (d.comment ? "\nКомментарий: " + d.comment : "");
  }

  function showDone(d, id, viaWa) {
    form.hidden = true; done.hidden = false;
    requestAnimationFrame(function () { done.classList.add("is-on"); });
    $("#doneText").textContent = viaWa
      ? "Мы открыли WhatsApp с готовым сообщением для администратора. Отправьте его, и " + CFG.adminName + " перезвонит вам по номеру " + d.phone + "."
      : CFG.adminName + " перезвонит вам по номеру " + d.phone + " в течение рабочего дня. Занятие: " + d.club + ".";
    var db = $("#doneBot");
    if (CFG.botUsername && id) { db.href = "https://t.me/" + CFG.botUsername + "?start=r" + id; db.hidden = false; }
    else db.hidden = true;
    form.reset(); $("#studentField").style.display = "";
    $(".done .btn--ghost-ink").focus({ preventScroll: true });
  }

  // ссылка вида #zapis=icon открывает форму на нужном занятии
  var m = location.hash.match(/^#zapis(?:=([\w-]+))?/);
  if (m) setTimeout(function () { openSheet(m[1] || ""); }, 600);
})();
