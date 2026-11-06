/**
 * Кинония: запись на занятия.
 * Google-таблица (журнал заявок) + Telegram-бот (каталог, запись, уведомления).
 *
 * Установка — в файле ИНСТРУКЦИЯ.md. Коротко:
 *  1. Таблица → Расширения → Apps Script → вставить этот файл.
 *  2. Вписать токен бота ниже в BOT_TOKEN_INIT.
 *  3. Начать развертывание → Веб-приложение → доступ «Все».
 *  4. Запустить функцию setup. В журнале появится код администратора.
 *  5. Написать боту: /admin КОД
 *  После setup токен хранится в свойствах скрипта, строку BOT_TOKEN_INIT можно очистить.
 */

var BOT_TOKEN_INIT = "";   // ← вставьте токен от @BotFather, запустите setup, потом можно стереть
var SITE_URL_INIT  = "";   // ← адрес сайта, например https://имя.github.io/kinonia/

var ADMIN_NAME  = "Анна";
var ADMIN_PHONE = "+7 925 144-71-72";
var ADDRESS     = "г. Химки, мкр. Сходня, ул. Первомайская, 9";
var HOURS       = "пн–чт 9:00–16:00, вс 12:00–16:00";

var SHEET_NAME = "Заявки";
var HEADERS = ["№", "Дата", "Откуда", "Занятие", "Кто занимается", "Ученик", "Возраст",
  "Контактное лицо", "Телефон", "Способ связи", "Комментарий", "Статус", "Обработал", "Telegram заявителя", "Педагог"];
var COL = { id: 1, club: 4, status: 12, by: 13, chat: 14 };

var P = PropertiesService.getScriptProperties();
function prop_(k) { return P.getProperty(k) || ""; }

/* ===================== Установка ===================== */

function setup() {
  if (BOT_TOKEN_INIT) P.setProperty("BOT_TOKEN", BOT_TOKEN_INIT.trim());
  if (SITE_URL_INIT) P.setProperty("SITE_URL", SITE_URL_INIT.trim());
  if (!prop_("BOT_TOKEN")) throw new Error("Впишите токен бота в BOT_TOKEN_INIT и запустите setup ещё раз.");
  if (!prop_("ADMIN_CODE")) P.setProperty("ADMIN_CODE", String(Math.floor(100000 + Math.random() * 900000)));

  sheet_();
  var me = tg_("getMe", {});
  if (!me.ok) throw new Error("Telegram не принял токен: " + me.description + ". Проверьте его в @BotFather.");
  P.setProperty("BOT_USERNAME", me.result.username);

  var url = prop_("WEBAPP_URL") || ScriptApp.getService().getUrl();
  if (!url) throw new Error("Сначала разверните скрипт как веб-приложение, затем запустите setup снова.");
  url = url.replace(/\/dev$/, "/exec");
  P.setProperty("WEBAPP_URL", url);

  var wh = tg_("setWebhook", { url: url, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  tg_("setMyName", { name: "Кинония — запись на занятия" });
  tg_("setMyShortDescription", { short_description: "Кружки и студии при Троицком храме на Сходне. Каталог, расписание и запись." });
  tg_("setMyDescription", { description:
    "Духовно-просветительский центр «Кинония» при храме Живоначальной Троицы на Сходне.\n\n" +
    "Здесь можно посмотреть все занятия для детей и взрослых и записаться за минуту. " +
    "Администратор перезвонит и пригласит на первое занятие.\n\nНажмите «Запустить»." });
  tg_("setMyCommands", { commands: [
    { command: "start", description: "Главное меню" },
    { command: "catalog", description: "Все занятия" },
    { command: "zapis", description: "Записаться на занятие" },
    { command: "contacts", description: "Адрес и контакты" },
    { command: "cancel", description: "Отменить запись" }
  ]});

  Logger.log("Бот: @" + me.result.username);
  Logger.log("Webhook: " + (wh.ok ? "подключён" : wh.description));
  Logger.log("Адрес для сайта (js/config.js → endpoint): " + url);
  Logger.log("КОД АДМИНИСТРАТОРА: отправьте боту  /admin " + prop_("ADMIN_CODE"));
}

/* ===================== Веб-приложение ===================== */

function doGet() {
  return json_({ ok: true, service: "kinonia", bot: prop_("BOT_USERNAME"), clubs: CLUBS.length });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) {}
  if (body.update_id !== undefined) {
    try { onUpdate_(body); } catch (err) { console.error(err && err.stack || err); }
    return json_({ ok: true });
  }
  try { return json_(onForm_(body)); }
  catch (err) { console.error(err); return json_({ ok: false, error: "server" }); }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== Заявка с сайта ===================== */

function onForm_(d) {
  if (d.website) return { ok: true, id: 0 };            // ловушка для спам-ботов
  var digits = String(d.phone || "").replace(/\D/g, "");
  if (digits.length !== 11 || String(d.name || "").trim().length < 2) return { ok: false, error: "validation" };

  var cache = CacheService.getScriptCache(), key = "ph" + digits;
  var hits = +(cache.get(key) || 0);
  if (hits >= 3) return { ok: false, error: "too_many" };
  cache.put(key, String(hits + 1), 600);

  var club = clubById_(d.clubId);
  var req = {
    source: "Сайт",
    club: club ? club.t : (d.club || "Помочь с выбором"),
    clubId: club ? club.id : "",
    forWhom: cut_(d.forWhom, 40), student: cut_(d.student, 80), age: cut_(d.age, 10),
    name: cut_(d.name, 80), phone: formatPhone_(digits), contact: cut_(d.contact, 20),
    comment: cut_(d.comment, 500), chat: ""
  };
  req.id = saveRequest_(req);
  notifyAdmins_(req);
  return { ok: true, id: req.id };
}

/* ===================== Таблица ===================== */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME, 0);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#13203A").setFontColor("#E6CC8C");
    sh.setColumnWidths(1, HEADERS.length, 140);
    sh.setColumnWidth(1, 50); sh.setColumnWidth(4, 260); sh.setColumnWidth(11, 260);
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(["Новая", "Связались", "Записан", "Отказ"], true).build();
    sh.getRange(2, COL.status, 1000, 1).setDataValidation(rule);
    var rng = sh.getRange(2, 1, 1000, HEADERS.length);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$L2="Новая"').setBackground("#FCEFD2").setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$L2="Записан"').setBackground("#DDEFE6").setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$L2="Отказ"').setFontColor("#999999").setRanges([rng]).build()
    ]);
  }
  return sh;
}

function saveRequest_(r) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id = +(prop_("LAST_ID") || 0) + 1;
    P.setProperty("LAST_ID", String(id));
    var club = clubById_(r.clubId);
    sheet_().appendRow([id, new Date(), r.source, r.club, r.forWhom, r.student, r.age, r.name,
      "'" + r.phone, r.contact, r.comment, "Новая", "", r.chat ? String(r.chat) : "",
      club ? club.teacher + (club.phone ? ", " + club.phone : "") : ""]);
    return id;
  } finally { lock.releaseLock(); }
}

function findRow_(id) {
  var sh = sheet_(), n = sh.getLastRow();
  if (n < 2) return 0;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (+ids[i][0] === +id) return i + 2;
  return 0;
}

/* ===================== Telegram: входящие ===================== */

function onUpdate_(u) {
  var cache = CacheService.getScriptCache();
  if (cache.get("u" + u.update_id)) return;     // Telegram может прислать то же обновление повторно
  cache.put("u" + u.update_id, "1", 21600);
  if (u.callback_query) return onCallback_(u.callback_query);
  if (u.message) return onMessage_(u.message);
}

function onMessage_(m) {
  var chat = m.chat.id;
  var text = (m.text || "").trim();
  var st = getState_(chat);

  if (/^\/start/.test(text)) {
    clearState_(chat);
    var arg = text.split(/\s+/)[1] || "";
    if (/^r\d+$/.test(arg)) return linkRequest_(chat, +arg.slice(1));
    if (/^c_/.test(arg) && clubById_(arg.slice(2))) return send_(chat, clubCard_(clubById_(arg.slice(2))), clubKb_(clubById_(arg.slice(2))));
    if (arg === "catalog") return send_(chat, catsText_(), catsKb_());
    return send_(chat, welcome_(m.from), menuKb_());
  }
  if (/^\/admin_off/.test(text)) {
    P.setProperty("ADMINS", JSON.stringify(admins_().filter(function (x) { return x !== chat; })));
    return send_(chat, "Уведомления о заявках в этот чат отключены.");
  }
  if (/^\/admin\b/.test(text)) return adminLogin_(chat, text.split(/\s+/)[1], m.from);
  if (/^\/catalog/.test(text)) return send_(chat, catsText_(), catsKb_());
  if (/^\/zapis/.test(text)) return send_(chat, "На какое занятие записать? Выберите направление:", catsKb_());
  if (/^\/contacts/.test(text)) return send_(chat, contacts_(), backKb_());
  if (/^\/cancel/.test(text) || /^отмена$/i.test(text)) {
    clearState_(chat);
    return send_(chat, "Запись отменена.", { remove_keyboard: true }, function () { send_(chat, "Чем ещё помочь?", menuKb_()); });
  }

  if (st) return flow_(chat, st, m, text);
  send_(chat, "Выберите, что вас интересует:", menuKb_());
}

function onCallback_(q) {
  var chat = q.message.chat.id, mid = q.message.message_id, d = q.data || "";
  var p = d.split(":");
  answer_(q.id);

  if (p[0] === "menu") return edit_(chat, mid, welcome_(q.from), menuKb_());
  if (p[0] === "cats") return edit_(chat, mid, catsText_(), catsKb_());
  if (p[0] === "cat") return edit_(chat, mid, "<b>" + esc_(CATS[p[1]]) + "</b>\nВыберите занятие:", catKb_(p[1]));
  if (p[0] === "club") { var c = clubById_(p[1]); if (c) return edit_(chat, mid, clubCard_(c), clubKb_(c)); return; }
  if (p[0] === "contacts") return edit_(chat, mid, contacts_(), backKb_());
  if (p[0] === "reg") return startFlow_(chat, p[1]);
  if (p[0] === "st") return setStatus_(q, +p[1], p[2]);
}

/* ===================== Запись прямо в боте ===================== */

function startFlow_(chat, clubId) {
  var c = clubById_(clubId);
  setState_(chat, { step: "name", clubId: c ? c.id : "", club: c ? c.t : "Помочь с выбором" });
  send_(chat, "Записываем на <b>" + esc_(c ? c.t : "занятие") + "</b>.\n\nКак вас зовут?", { remove_keyboard: true });
}

function flow_(chat, st, m, text) {
  if (st.step === "name") {
    if (text.length < 2) return send_(chat, "Напишите, пожалуйста, ваше имя.");
    st.name = cut_(text, 80); st.step = "who"; setState_(chat, st);
    return send_(chat, "Кто будет заниматься? Напишите имя и возраст, например: <i>дочь Варвара, 9 лет</i>.\nЕсли занимаетесь вы сами, напишите «я».");
  }
  if (st.step === "who") {
    if (!text) return send_(chat, "Напишите, кто будет заниматься.");
    st.who = cut_(text, 120); st.step = "phone"; setState_(chat, st);
    return send_(chat, "Оставьте номер телефона, чтобы администратор мог перезвонить. Нажмите кнопку ниже или напишите номер.", {
      keyboard: [[{ text: "📱 Отправить мой номер", request_contact: true }], [{ text: "Отмена" }]],
      resize_keyboard: true, one_time_keyboard: true
    });
  }
  if (st.step === "phone") {
    var raw = m.contact ? m.contact.phone_number : text;
    var dg = String(raw).replace(/\D/g, "");
    if (dg.length === 10) dg = "7" + dg;
    if (dg.length === 11 && dg[0] === "8") dg = "7" + dg.slice(1);
    if (dg.length !== 11) return send_(chat, "Не получилось распознать номер. Напишите его в виде +7 900 000-00-00.");
    var self = /^я\b/i.test(st.who);
    var req = {
      source: "Telegram", club: st.club, clubId: st.clubId,
      forWhom: self ? "Я сам(а)" : "Ребёнок / родственник", student: self ? "" : st.who, age: "",
      name: st.name, phone: formatPhone_(dg), contact: "Telegram" + (m.from.username ? " @" + m.from.username : ""),
      comment: "", chat: chat
    };
    req.id = saveRequest_(req);
    clearState_(chat);
    notifyAdmins_(req);
    return send_(chat,
      "🕊 <b>Заявка №" + req.id + " принята.</b>\n\n" + esc_(req.club) + "\n\n" +
      ADMIN_NAME + " перезвонит вам по номеру " + req.phone + " в течение рабочего дня. Когда запись подтвердят, я напишу сюда.",
      { remove_keyboard: true }, function () { send_(chat, "Что-нибудь ещё?", menuKb_()); });
  }
}

/* ===================== Администраторы ===================== */

function admins_() { try { return JSON.parse(prop_("ADMINS") || "[]"); } catch (e) { return []; } }

function adminLogin_(chat, code, from) {
  if (!code || code !== prop_("ADMIN_CODE")) return send_(chat, "Код не подошёл.");
  var a = admins_();
  if (a.indexOf(chat) < 0) a.push(chat);
  P.setProperty("ADMINS", JSON.stringify(a));
  send_(chat, "✅ Готово, " + esc_(from.first_name || "") + ". Новые заявки будут приходить в этот чат.\nОтключиться: /admin_off");
}

function notifyAdmins_(r) {
  var a = admins_();
  if (!a.length) return;
  var dg = r.phone.replace(/\D/g, "");
  var text =
    "🕊 <b>Новая заявка №" + r.id + "</b> · " + esc_(r.source) + "\n\n" +
    "<b>" + esc_(r.club) + "</b>\n" +
    "Кто: " + esc_([r.forWhom, r.student, r.age ? r.age + " лет" : ""].filter(String).join(", ")) + "\n" +
    "Контакт: " + esc_(r.name) + ", " + esc_(r.phone) + (r.contact ? " (" + esc_(r.contact) + ")" : "") +
    (r.comment ? "\nКомментарий: " + esc_(r.comment) : "");
  var c = clubById_(r.clubId);
  if (c) text += "\nПедагог: " + esc_(c.teacher) + (c.phone ? ", " + esc_(c.phone) : "");
  var kb = { inline_keyboard: [
    [{ text: "📞 Связались", callback_data: "st:" + r.id + ":Связались" }, { text: "✅ Записан", callback_data: "st:" + r.id + ":Записан" }],
    [{ text: "✖ Отказ", callback_data: "st:" + r.id + ":Отказ" }, { text: "WhatsApp", url: "https://wa.me/" + dg }]
  ]};
  a.forEach(function (id) { send_(id, text, kb); });
}

function setStatus_(q, id, status) {
  var chat = q.message.chat.id;
  if (admins_().indexOf(chat) < 0) return;
  var row = findRow_(id);
  if (!row) return send_(chat, "Заявка №" + id + " не найдена в таблице.");
  var sh = sheet_();
  var who = (q.from.first_name || "") + " " + Utilities.formatDate(new Date(), "Europe/Moscow", "dd.MM HH:mm");
  sh.getRange(row, COL.status).setValue(status);
  sh.getRange(row, COL.by).setValue(who);

  var mark = { "Связались": "📞", "Записан": "✅", "Отказ": "✖" }[status] || "•";
  var base = (q.message.text || "").split("\n\nСтатус:")[0];
  tg_("editMessageText", {
    chat_id: chat, message_id: q.message.message_id,
    text: base + "\n\nСтатус: " + mark + " " + status + " — " + who,
    reply_markup: q.message.reply_markup
  });

  var applicant = sh.getRange(row, COL.chat).getValue();
  if (applicant && status === "Записан") {
    var club = sh.getRange(row, COL.club).getValue();
    var c = CLUBS.filter(function (x) { return x.t === club; })[0];
    send_(applicant, "✅ <b>Вы записаны: " + esc_(club) + "</b>\n" +
      (c ? "Расписание: " + esc_(c.when) + "\n" : "") + "Адрес: " + ADDRESS + "\n\nЖдём вас! Если планы поменяются, позвоните " + ADMIN_NAME + ": " + ADMIN_PHONE);
  }
}

function linkRequest_(chat, id) {
  var row = findRow_(id);
  if (!row) return send_(chat, welcome_({}), menuKb_());
  var sh = sheet_();
  sh.getRange(row, COL.chat).setValue(String(chat));
  send_(chat, "🕊 Заявка №" + id + " на <b>" + esc_(sh.getRange(row, COL.club).getValue()) + "</b> у нас.\nКогда администратор подтвердит запись, я сообщу здесь.", menuKb_());
}

/* ===================== Тексты и клавиатуры ===================== */

function welcome_(from) {
  return "Здравствуйте" + (from && from.first_name ? ", " + esc_(from.first_name) : "") + "!\n\n" +
    "Это бот центра <b>«Кинония»</b> при храме Живоначальной Троицы на Сходне. " +
    "У нас " + CLUBS.length + " занятий для детей и взрослых: иконопись, резьба, изостудия, шахматы, языки, танец и многое другое.\n\n" +
    "Выберите занятие и запишитесь — администратор перезвонит и пригласит на первое занятие.";
}
function catsText_() { return "<b>Занятия «Кинонии»</b>\nВыберите направление:"; }
function contacts_() {
  return "📍 <b>" + ADDRESS + "</b>\nПять минут пешком от станции Сходня, есть парковка.\n\n" +
    "🕰 " + HOURS + "\n📞 " + ADMIN_NAME + ", администратор: " + ADMIN_PHONE;
}
function clubCard_(c) {
  return "<b>" + esc_(c.t) + "</b>\n" +
    "<i>" + esc_(CATS[c.cat]) + " · " + esc_(c.age) + "</i>\n\n" +
    esc_(c.desc) + "\n\n" +
    "🗓 " + esc_(c.when) + "\n" +
    "👤 " + esc_(c.teacher) + "\n" +
    (c.price ? "🤲 " + esc_(c.price) + "\n" : "");
}
function menuKb_() {
  var rows = [
    [{ text: "📚 Все занятия", callback_data: "cats" }],
    [{ text: "✍️ Записаться", callback_data: "cats" }, { text: "📍 Как добраться", callback_data: "contacts" }]
  ];
  if (prop_("SITE_URL")) rows.push([{ text: "🌐 Сайт центра", url: prop_("SITE_URL") }]);
  return { inline_keyboard: rows };
}
function catsKb_() {
  var rows = Object.keys(CATS).map(function (k) {
    var n = CLUBS.filter(function (c) { return c.cat === k; }).length;
    return [{ text: CATS[k] + " · " + n, callback_data: "cat:" + k }];
  });
  rows.push([{ text: "Не знаю, помогите выбрать", callback_data: "reg:" }]);
  rows.push([{ text: "← Меню", callback_data: "menu" }]);
  return { inline_keyboard: rows };
}
function catKb_(k) {
  var rows = CLUBS.filter(function (c) { return c.cat === k; }).map(function (c) { return [{ text: c.t, callback_data: "club:" + c.id }]; });
  rows.push([{ text: "← Направления", callback_data: "cats" }]);
  return { inline_keyboard: rows };
}
function clubKb_(c) {
  return { inline_keyboard: [
    [{ text: "✍️ Записаться", callback_data: "reg:" + c.id }],
    [{ text: "← " + CATS[c.cat], callback_data: "cat:" + c.cat }, { text: "Меню", callback_data: "menu" }]
  ]};
}
function backKb_() { return { inline_keyboard: [[{ text: "← Меню", callback_data: "menu" }]] }; }

/* ===================== Помощники ===================== */

function tg_(method, payload) {
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + prop_("BOT_TOKEN") + "/" + method, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { ok: false, description: res.getContentText() }; }
}
function send_(chat, text, kb, then) {
  var p = { chat_id: chat, text: text, parse_mode: "HTML", disable_web_page_preview: true };
  if (kb) p.reply_markup = kb;
  var r = tg_("sendMessage", p);
  if (then) then();
  return r;
}
function edit_(chat, mid, text, kb) {
  var r = tg_("editMessageText", { chat_id: chat, message_id: mid, text: text, parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true });
  if (!r.ok && !/not modified/.test(r.description || "")) send_(chat, text, kb);
}
function answer_(id) { tg_("answerCallbackQuery", { callback_query_id: id }); }

function getState_(chat) { var s = CacheService.getScriptCache().get("s" + chat); return s ? JSON.parse(s) : null; }
function setState_(chat, s) { CacheService.getScriptCache().put("s" + chat, JSON.stringify(s), 21600); }
function clearState_(chat) { CacheService.getScriptCache().remove("s" + chat); }

function clubById_(id) { for (var i = 0; i < CLUBS.length; i++) if (CLUBS[i].id === id) return CLUBS[i]; return null; }
function esc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function cut_(s, n) { return String(s == null ? "" : s).trim().slice(0, n); }
function formatPhone_(d) { return "+7 " + d.slice(1, 4) + " " + d.slice(4, 7) + "-" + d.slice(7, 9) + "-" + d.slice(9, 11); }

/* ===================== Каталог для бота =====================
   Сгенерирован из js/clubs.js сайта. Меняете занятия на сайте —
   обновите и этот блок (или попросите того, кто ведёт сайт). */
var CATS = {"craft":"Ремёсла","art":"Искусство","mind":"Языки и мышление","family":"Семья и учёба","soul":"Беседа и помощь"};
var CLUBS = [
 {
  "id": "izo",
  "cat": "art",
  "t": "Изостудия «Юный художник»",
  "age": "4–16 лет",
  "when": "Сб 11:00–12:00 (7–16 лет); Сб 12:10–12:50 (4–6 лет)",
  "teacher": "Грозова Марианна Дмитриевна",
  "phone": "+7 910 086-68-89",
  "price": "от 700 ₽ за занятие",
  "desc": "Гуашь, акварель, пастель, скетчинг и необычные техники — набрызг, оттиски, аппликация. Авторская программа на опыте детской школы искусств: задания усложняются постепенно, у каждого ребёнка свой темп и свой стиль. Работы учеников печатают на открытках."
 },
 {
  "id": "pyro",
  "cat": "craft",
  "t": "Выжигание по дереву «Пирография»",
  "age": "дети",
  "when": "Вт 16:00–17:00; Чт 16:00–17:00",
  "teacher": "Мардашкина Мария Максимовна",
  "phone": "+7 916 549-17-11",
  "price": "",
  "desc": "Рисунок по дереву раскалённым пером: от эскиза и перевода на доску до тонких теней и фактур. Занятие учит аккуратности и твёрдой руке, а домой уходит готовая вещь — доска, шкатулка или панно."
 },
 {
  "id": "tatyanka",
  "cat": "craft",
  "t": "Художественная резьба по дереву «Татьянка»",
  "age": "10+ и взрослые",
  "when": "Вт 17:30–19:00; Чт 17:30–19:00",
  "teacher": "Мардашкина Мария Максимовна",
  "phone": "+7 916 549-17-11",
  "price": "600 ₽ за занятие",
  "desc": "Резьба «Татьянка» узнаётся по пластике и филигранным узорам. Освоить её может каждый, а по пути развиваются терпение, точность движений и умение увидеть готовую вещь в объёме ещё до первого надреза. Вдохновение берём в природе."
 },
 {
  "id": "dance",
  "cat": "art",
  "t": "Студия исторического танца «Свет»",
  "age": "все возрасты",
  "when": "Вс 18:00",
  "teacher": "Забулонова Светлана Александровна",
  "phone": "+7 926 134-54-25",
  "price": "",
  "desc": "Бальные танцы прошлых веков: осанка, шаг, фигуры и манеры. Танцуют парами и в общем кругу, без спешки и под живую музыку эпохи. Хорошо подходит тем, кто хочет двигаться красиво и быть в компании."
 },
 {
  "id": "eng",
  "cat": "mind",
  "t": "Английский и корейский язык",
  "age": "0+",
  "when": "Вт 17:30; Чт 17:30",
  "teacher": "Белоусова Юлия Сергеевна",
  "phone": "+7 924 935-30-57",
  "price": "",
  "desc": "Два языка у одного преподавателя: английский — для учёбы и путешествий, корейский — для тех, кого увлекает культура Кореи. Группы собираются по возрасту и уровню, начать можно с нуля."
 },
 {
  "id": "crochet",
  "cat": "craft",
  "t": "Вязание крючком «Волшебные петельки»",
  "age": "с 5 лет",
  "when": "Ср 16:00; Сб 13:10",
  "teacher": "Овсяникова Екатерина Александровна",
  "phone": "+7 962 136-66-31",
  "price": "",
  "desc": "Первая петля, цепочка, столбики — и вот уже игрушка, прихватка или салфетка. Вязание развивает мелкую моторику и усидчивость, а результат можно подарить маме уже через пару занятий."
 },
 {
  "id": "icon",
  "cat": "art",
  "t": "Иконописная мастерская «Под кровом»",
  "age": "14+",
  "when": "Ср 16:00–19:00; Сб 09:00–12:00",
  "teacher": "Скумс Юлия Игоревна",
  "phone": "+7 903 729-27-28",
  "price": "1500 ₽ за занятие",
  "desc": "Пятый год мастерская учит древнему ремеслу и духовным законам создания Образа. Копируем древние иконы, разбираем приёмы мастеров прошлого, работаем с обратной перспективой. Пишем натуральными пигментами на яичной эмульсии по доскам с левкасом. Художественное образование не нужно."
 },
 {
  "id": "chess",
  "cat": "mind",
  "t": "Шахматы",
  "age": "6+",
  "when": "Вс 14:00–15:00",
  "teacher": "Цилидис Александр Георгиевич",
  "phone": "+7 917 574-14-29",
  "price": "1000 ₽ за занятие",
  "desc": "Искусство замечать возможности и продумывать ход наперёд. Шахматы развивают внимание, память и логику, учат терпению и ответственности за свои решения. Занятие длится 60 минут, запись обязательна."
 },
 {
  "id": "greek",
  "cat": "mind",
  "t": "Греческий язык",
  "age": "10+ и взрослые",
  "when": "по согласованию с педагогом",
  "teacher": "Катанова Эллада Алексеевна",
  "phone": "+7 962 976-24-71",
  "price": "1000 ₽ за занятие",
  "desc": "Древнегреческий — ключ к языку Евангелия и античной культуре. Новогреческий — живой язык для общения и поездок по Греции. Группы по 4–5 человек или индивидуально."
 },
 {
  "id": "psy",
  "cat": "soul",
  "t": "Психологические консультации",
  "age": "16+",
  "when": "по согласованию, очно или онлайн",
  "teacher": "Священник Глеб Курский",
  "phone": "+7 926 568-67-39",
  "price": "за пожертвование",
  "desc": "Поддержка в трудные моменты жизни от специалиста, который соединяет знание психологии и опыт пастыря. Индивидуальный подход и полная конфиденциальность."
 },
 {
  "id": "cinema",
  "cat": "soul",
  "t": "Психологический киноклуб",
  "age": "16+",
  "when": "по воскресеньям, следите за расписанием",
  "teacher": "Священник Глеб Курский",
  "phone": "+7 926 568-67-39",
  "price": "за пожертвование",
  "desc": "Смотрим фильм вместе в актовом зале, а потом долго и честно обсуждаем: почему герои поступают так, что это говорит о нас самих. Встречи помогают лучше понимать людей и сложные жизненные ситуации."
 },
 {
  "id": "guitar",
  "cat": "art",
  "t": "Гитара",
  "age": "7+",
  "when": "Вт 18:30; Чт 18:30",
  "teacher": "Дыкий Макар",
  "phone": "+7 916 062-03-52",
  "price": "",
  "desc": "От первых аккордов до песен, которые можно спеть всей компанией. Постановка рук, ритм, перебор и игра по слуху. Свою гитару можно принести, если её нет — подскажем, с какой начать."
 },
 {
  "id": "writing",
  "cat": "art",
  "t": "Писательская мастерская «Черновик»",
  "age": "подростки и взрослые",
  "when": "Вс 13:30",
  "teacher": "Шуман София Тимуровна",
  "phone": "",
  "price": "",
  "desc": "Место, где не страшно показать свой черновик. Пишем короткие тексты по заданиям, читаем вслух и разбираем друг друга бережно и по делу: сюжет, герой, язык. Подойдёт и тем, кто только хочет начать."
 },
 {
  "id": "sew-kids",
  "cat": "craft",
  "t": "Швейная мастерская для детей «Нитка за ниткой»",
  "age": "5+",
  "when": "Чт 17:00",
  "teacher": "Пятачкова Наталья Николаевна",
  "phone": "+7 901 791-09-39",
  "price": "",
  "desc": "Иголка, нитка, выкройка — и первая собственная вещь: игольница, мешочек, мягкая игрушка. Учимся ручным швам и аккуратной работе с тканью в спокойном темпе."
 },
 {
  "id": "sew-adults",
  "cat": "craft",
  "t": "Курсы кройки и шитья",
  "age": "взрослые",
  "when": "Вс 16:00–18:00",
  "teacher": "Крицкая Оксана, Козлова Ирина",
  "phone": "+7 903 728-61-19",
  "price": "",
  "desc": "Снимаем мерки, строим выкройку, кроим и шьём на машинке от начала до готового изделия. Занятие длится два часа: хватает времени и на теорию, и на работу за столом."
 },
 {
  "id": "logoped",
  "cat": "family",
  "t": "Логопед-дефектолог",
  "age": "от 1,5 лет",
  "when": "индивидуально, по предварительной записи",
  "teacher": "Ахметзянова Виктория Кадыровна",
  "phone": "+7 903 763-08-30",
  "price": "по договорённости",
  "desc": "Индивидуальные занятия в специально оборудованном кабинете. Помогаем при задержке речевого развития, неправильном произношении звуков, заикании, трудностях с чтением и письмом."
 },
 {
  "id": "family-classes",
  "cat": "family",
  "t": "Семейные классы",
  "age": "1–5 класс",
  "when": "Пн–Пт, учебный день",
  "teacher": "Руководители: Елена и Андрей",
  "phone": "+7 926 583-65-02",
  "price": "",
  "desc": "Альтернатива для тех, кто выбрал семейное образование: маленькие классы, опытный учитель начальной школы и программа по ФГОС с углублением. Дети также изучают Закон Божий и церковнославянский язык, играют в праздничных спектаклях, а в конце года сдают аттестацию в государственной школе."
 },
 {
  "id": "classical",
  "cat": "family",
  "t": "Классические беседы",
  "age": "4–11 лет",
  "when": "Пн 09:00–16:00",
  "teacher": "Смолякова Жанна",
  "phone": "+7 916 391-34-79",
  "price": "",
  "desc": "Программа академической поддержки семей на домашнем обучении. «Основы» закладывают фундамент из шести предметных областей, научного метода и искусства. «Ключи» открывают грамматику, стиль русского языка и твёрдую арифметику. Это сообщество единомышленников, а не просто кружок."
 }
];
