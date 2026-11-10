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
  function plural(n, f) { var m = n % 10, h = n % 100; return f[m === 1 && h !== 11 ? 0 : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 1 : 2]; }
  // уменьшенная копия фото с CDN Тильды
  function thumb(url, w) {
    if (!url) return "";
    var m = url.match(/^https:\/\/static\.tildacdn\.com\/(tild[^/]+)\/(.+)$/);
    if (m) return "https://thb.tildacdn.com/" + m[1] + "/-/resize/" + w + "x/" + m[2];
    // свои фото: маленькая версия для карточек, большая для подробного описания
    return w <= 700 ? url.replace(/\.webp$/, "-sm.webp") : url;
  }
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

  /* ---------- Шапка ---------- */
  var bar = $("#bar");
  var onScroll = function () { bar.classList.toggle("is-solid", scrollY > 24); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // меню-«бургер» на планшете и телефоне
  var burger = $("#burger");
  function setMenu(open) {
    bar.classList.toggle("is-menu", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    document.documentElement.classList.toggle("no-scroll", open);
  }
  burger.addEventListener("click", function () { setMenu(!bar.classList.contains("is-menu")); });
  $$("#nav a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  addEventListener("resize", function () { if (innerWidth > 980) setMenu(false); });

  /* ---------- Первый экран: арки с фото ---------- */
  $$("[data-arch]").forEach(function (arch, k) {
    var imgs = $$("img", arch), i = 0;
    imgs[0].classList.add("is-on");
    if (reduce || imgs.length < 2) return;
    setTimeout(function () {
      setInterval(function () {
        imgs[i].classList.toggle("is-on", false);
        i = (i + 1) % imgs.length;
        imgs[i].classList.add("is-on");
      }, 4200);
    }, 1400 + k * 1400);
  });
  // лёгкий параллакс арок за курсором
  var stage = $(".hero__stage");
  if (stage && !reduce && matchMedia("(pointer: fine)").matches) {
    var raf = 0;
    $(".hero").addEventListener("pointermove", function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
        stage.style.setProperty("--mx", x.toFixed(3));
        stage.style.setProperty("--my", y.toFixed(3));
      });
    });
  }

  /* ---------- Бегущая строка с названиями занятий ---------- */
  var tick = $("#ticker");
  if (tick) {
    var row = CLUBS.map(function (c) { return "<span>" + esc(c.title) + "</span><i></i>"; }).join("");
    tick.innerHTML = '<div class="ticker__row">' + row + '</div><div class="ticker__row">' + row + "</div>";
  }

  /* ---------- Появление блоков при прокрутке ---------- */
  function reveal(els) {
    if (reduce || !("IntersectionObserver" in window)) return;
    els.forEach(function (el) { el.classList.add("rv"); });
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        el.classList.add("in");
        setTimeout(function () {
          el.classList.toggle("rv", false); el.classList.toggle("in", false);
          el.style.removeProperty("--d");
        }, 1400);
      });
    }, { rootMargin: "0px 0px 10% 0px", threshold: 0 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Фильтры ---------- */
  var state = { who: "any", cat: "any", day: 0 };
  var fCat = $("#fCat");
  fCat.innerHTML = '<button class="chip is-on" data-cat="any">Все направления</button>' +
    Object.keys(CATS).map(function (k) {
      return '<button class="chip" data-cat="' + k + '" style="--c:' + CATS[k].color + '"><i></i>' + CATS[k].name + "</button>";
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

  /* ---------- Карточки ---------- */
  var cards = $("#cards");
  cards.innerHTML = CLUBS.map(function (c) {
    var cat = CATS[c.cat];
    return '<li class="card" data-id="' + c.id + '" style="--c:' + cat.color + '">' +
      '<button class="card__btn" data-info="' + c.id + '">' +
        '<span class="card__img"><img src="' + thumb(c.photo, 640) + '" alt="" decoding="async"><span class="card__age">' + esc(c.age) + "</span></span>" +
        '<span class="card__body">' +
          '<span class="card__cat">' + esc(cat.name) + "</span>" +
          '<span class="card__title">' + esc(c.title) + "</span>" +
          (c.name ? '<span class="card__name">«' + esc(c.name) + "»</span>" : "") +
          '<span class="card__when">' + esc(whenText(c)) + "</span>" +
          '<span class="card__more">Подробнее и запись</span>' +
        "</span>" +
      "</button></li>";
  }).join("");

  // карточки видны сразу: при быстрой прокрутке на телефоне не должно быть пустых мест
  reveal($$("[data-reveal]").concat($$("[data-reveal-kids] > *").map(function (el, i) { el.style.setProperty("--d", i * 120 + "ms"); return el; })));

  function render() {
    var n = 0;
    $$(".card", cards).forEach(function (el) {
      var ok = matches(byId[el.dataset.id]);
      if (ok) {
        n++;
        if (el.hidden) { el.hidden = false; el.classList.add("is-out"); requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove("is-out"); }); }); }
      } else el.hidden = true;
    });
    $("#count").textContent = n === CLUBS.length ? "Все " + n + " занятий" : "Подходит: " + n + " " + plural(n, ["занятие", "занятия", "занятий"]);
    $("#empty").hidden = n > 0;
  }
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
        return '<button class="slot" data-info="' + it.c.id + '" style="--c:' + CATS[it.c.cat].color + '"><b>' + timeRange(it.s) + "</b><span>" + esc(it.c.name || it.c.title) + (it.s.note ? " · " + esc(it.s.note) : "") + "</span></button>";
      }).join("") + "</div>";
  }
  grid.innerHTML = html;
  grid.addEventListener("pointerover", function (e) {
    var s = e.target.closest(".slot"); if (!s) return;
    grid.classList.add("is-hl");
    $$(".slot", grid).forEach(function (x) { x.classList.toggle("is-hl", x.dataset.info === s.dataset.info); });
  });
  grid.addEventListener("pointerleave", function () { grid.classList.remove("is-hl"); });

  $("#flexList").innerHTML = CLUBS.filter(function (c) { return !c.slots.length; }).map(function (c) {
    return '<li><button data-info="' + c.id + '" style="--c:' + CATS[c.cat].color + '"><i></i>' + esc(fullTitle(c)) + "</button></li>";
  }).join("");

  /* ---------- Контакты ---------- */
  $("#addr").textContent = CFG.address;
  $("#hours").textContent = CFG.hours;
  $("#admin").innerHTML = esc(CFG.adminName) + ', <a href="tel:+' + CFG.adminPhoneRaw + '">' + esc(CFG.adminPhone) + "</a>";
  $("#links").innerHTML =
    '<a class="btn btn--red btn--sm" href="https://wa.me/' + CFG.adminPhoneRaw + '" target="_blank" rel="noopener">WhatsApp</a>' +
    '<a class="btn btn--outline btn--sm" href="https://t.me/+' + CFG.adminPhoneRaw + '" target="_blank" rel="noopener">Telegram</a>' +
    '<a class="btn btn--outline btn--sm" href="https://yandex.ru/maps/?text=' + encodeURIComponent("Химки, Сходня, Первомайская улица, 9") + '" target="_blank" rel="noopener">Построить маршрут</a>';
  if (CFG.botUsername) { var bl = $("#botLink"); bl.href = "https://t.me/" + CFG.botUsername + "?start=catalog"; bl.hidden = false; }

  /* ---------- Панели ---------- */
  var info = $("#info"), sheet = $("#sheet"), form = $("#form"), done = $("#done"), sel = $("#fClub"), lastFocus = null;

  function openPanel(p, focusEl) {
    if (!lastFocus) lastFocus = document.activeElement;
    p.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add("is-open"); }); });
    if (focusEl) setTimeout(function () { focusEl().focus({ preventScroll: true }); }, 350);
  }
  function closePanel(p, keepFocus) {
    p.classList.remove("is-open");
    setTimeout(function () {
      p.hidden = true;
      if (info.hidden && sheet.hidden) {
        document.body.style.overflow = "";
        if (!keepFocus && lastFocus) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
      }
    }, reduce ? 0 : 450);
  }

  // одно фото целиком (без обрезки) на размытом фоне из того же снимка
  function slide(p, i, n) {
    var src = thumb(p, 1080), doc = /-doc\./.test(p);
    return '<div class="ph' + (doc ? ' is-doc' : '') + '"' + (doc ? '' : ' style="background-image:url(' + src + ')"') + '>' +
      '<img src="' + src + '" alt="' + (n > 1 ? 'Фото ' + (i + 1) + ' из ' + n : '') + '"' + (i ? ' loading="lazy"' : '') + '></div>';
  }
  function openInfo(id) {
    var c = byId[id]; if (!c) return;
    var cat = CATS[c.cat];
    // фото занятия: основное + дополнительные из поля photos
    var pics = [c.photo].concat(c.photos || []);
    var gallery = pics.length < 2
      ? '<div class="info__img">' + slide(c.photo, 0, 1) + '</div>'
      : '<div class="info__img gal">' +
          '<div class="gal__track">' + pics.map(function (p, i) {
            // документы (дипломы, грамоты) показываем целиком, без обрезки
            return slide(p, i, pics.length);
          }).join("") + "</div>" +
          '<button class="gal__btn gal__btn--prev" aria-label="Предыдущее фото">‹</button>' +
          '<button class="gal__btn gal__btn--next" aria-label="Следующее фото">›</button>' +
          '<div class="gal__dots">' + pics.map(function (p, i) { return "<i" + (i ? "" : ' class="is-on"') + "></i>"; }).join("") + "</div>" +
        "</div>";
    $("#infoBody").innerHTML =
      gallery +
      '<div class="info__body" style="--c:' + cat.color + '">' +
        '<span class="info__cat">' + esc(cat.name) + " · " + esc(c.age) + "</span>" +
        '<h2 class="info__title" id="info-title">' + esc(c.title) + "</h2>" +
        (c.name ? '<p class="info__name">«' + esc(c.name) + "»</p>" : "") +
        '<p class="info__desc">' + esc(c.desc) + "</p>" +
        '<dl class="info__dl">' +
          "<div><dt>Расписание</dt><dd>" + esc(whenText(c)) + "</dd></div>" +
          "<div><dt>Ведёт</dt><dd>" + esc(c.teacher) + (c.teacherNote ? "<span>" + esc(c.teacherNote) + "</span>" : "") + "</dd></div>" +
          "<div><dt>Пожертвование</dt><dd>" + esc(c.price || "уточните у администратора") + "</dd></div>" +
        "</dl>" +
        '<div class="info__act"><button class="btn btn--red btn--wide" data-signup="' + c.id + '">Записаться</button>' +
          (c.phone ? '<a class="btn btn--outline btn--wide" href="tel:' + c.phone.replace(/[^\d+]/g, "") + '">Позвонить педагогу: ' + esc(c.phone) + "</a>" : "") +
        "</div>" +
      "</div>";
    info.querySelector(".sheet__panel").scrollTop = 0;
    openPanel(info, function () { return $(".info__act .btn", info); });
    bindGallery($(".gal", info));
  }

  // листание фото: пальцем (scroll-snap), стрелками и клавишами
  function bindGallery(g) {
    if (!g) return;
    var track = $(".gal__track", g), dots = $$(".gal__dots i", g);
    var go = function (dir) { track.scrollBy({ left: dir * track.clientWidth, behavior: reduce ? "auto" : "smooth" }); };
    $(".gal__btn--prev", g).addEventListener("click", function () { go(-1); });
    $(".gal__btn--next", g).addEventListener("click", function () { go(1); });
    var imgs = $$("img", track), cur = 0;
    // высота галереи подстраивается под текущее фото — без пустых полос сверху и снизу
    var fit = function () { var h = imgs[cur] && imgs[cur].offsetHeight; if (h) track.style.height = h + "px"; };
    imgs.forEach(function (im) { im.addEventListener("load", fit); });
    track.addEventListener("scroll", function () {
      var i = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach(function (d, k) { d.classList.toggle("is-on", k === i); });
      if (i !== cur) { cur = i; fit(); }
    }, { passive: true });
    addEventListener("resize", fit);
    fit();
  }

  function openSheet(id) {
    form.hidden = false; done.hidden = true; done.classList.remove("is-on"); $("#fail").hidden = true;
    sel.value = id && byId[id] ? id : "";
    if (!info.hidden) closePanel(info, true);
    openPanel(sheet, function () { return sel.value ? form.elements.student : sel; });
  }

  document.addEventListener("click", function (e) {
    var s = e.target.closest("[data-signup]");
    if (s) { e.preventDefault(); openSheet(s.getAttribute("data-signup")); return; }
    var i = e.target.closest("[data-info]");
    if (i) { openInfo(i.getAttribute("data-info")); return; }
    if (e.target.closest("[data-close]")) closePanel(e.target.closest(".sheet"));
  });
  document.addEventListener("keydown", function (e) {
    var open = !sheet.hidden ? sheet : !info.hidden ? info : null;
    if (!open) return;
    if (e.key === "Escape") closePanel(open);
    if (e.key === "Tab") {
      var f = $$("button, a[href], input:not(.hp), select, textarea", open).filter(function (x) { return x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- Форма записи ---------- */
  sel.innerHTML = '<option value="">Помогите выбрать</option>' +
    Object.keys(CATS).map(function (k) {
      return '<optgroup label="' + CATS[k].name + '">' + CLUBS.filter(function (c) { return c.cat === k; }).map(function (c) {
        return '<option value="' + c.id + '">' + esc(fullTitle(c)) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");

  form.addEventListener("change", function (e) {
    if (e.target.name !== "forWhom") return;
    $("#studentField").style.display = e.target.value === "Я сам(а)" ? "none" : "";
    $("#studentField span").textContent = e.target.value === "Всей семьёй" ? "Кто ещё придёт" : "Имя ученика";
  });

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
    var nameF = form.elements.name.closest(".field");
    var nm = form.elements.name.value.trim().length >= 2;
    nameF.classList.toggle("is-bad", !nm);
    var ph = phone.value.replace(/\D/g, "").length === 11;
    phone.closest(".field").classList.toggle("is-bad", !ph);
    var cs = form.elements.consent.checked;
    $(".field__err--check").classList.toggle("is-on", !cs);
    var ok = nm && ph && cs;
    if (!ok) ($(".is-bad input", form) || form.elements.consent).focus();
    return ok;
  }

  function message(d) {
    return "Здравствуйте! Хочу записаться в «Кинонию».\n" +
      "Занятие: " + d.club + "\n" +
      "Кто занимается: " + d.forWhom + (d.student ? ", " + d.student : "") + (d.age ? ", " + d.age + " лет" : "") + "\n" +
      "Контакт: " + d.name + ", " + d.phone + " (" + d.contact + ")" +
      (d.comment ? "\nКомментарий: " + d.comment : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements.website.value) return;
    if (!validate()) return;
    var c = byId[sel.value];
    var data = {
      source: "site", clubId: sel.value || "", club: c ? fullTitle(c) : "Помочь с выбором",
      forWhom: form.elements.forWhom.value, student: form.elements.student.value.trim(),
      age: form.elements.age.value.trim(), name: form.elements.name.value.trim(),
      phone: phone.value, contact: form.elements.contact.value, comment: form.elements.comment.value.trim()
    };
    var btn = $("#submit");
    btn.disabled = true; btn.textContent = "Отправляем…";

    if (!CFG.endpoint) { // запасной путь, пока сервер не подключён
      btn.disabled = false; btn.textContent = "Отправить заявку";
      window.open("https://wa.me/" + CFG.adminPhoneRaw + "?text=" + encodeURIComponent(message(data)), "_blank", "noopener");
      showDone(data, null, true);
      return;
    }

    fetch(CFG.endpoint, { method: "POST", body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (!res.ok) throw new Error(res.error || "fail"); showDone(data, res.id, false); })
      .catch(function () {
        var f = $("#fail");
        f.hidden = false;
        f.innerHTML = 'Заявка не отправилась: нет связи с сервером. Проверьте интернет и нажмите ещё раз или <a href="https://wa.me/' + CFG.adminPhoneRaw + "?text=" + encodeURIComponent(message(data)) + '" target="_blank" rel="noopener">отправьте её в WhatsApp</a>.';
      })
      .finally(function () { btn.disabled = false; btn.textContent = "Отправить заявку"; });
  });

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
    $(".done .btn--outline").focus({ preventScroll: true });
  }

  // #zapis=icon открывает запись, #kruzhok=icon — карточку занятия
  var m = location.hash.match(/^#(zapis|kruzhok)(?:=([\w-]+))?/);
  if (m) setTimeout(function () { m[1] === "kruzhok" && m[2] ? openInfo(m[2]) : openSheet(m[2] || ""); }, 500);
})();
