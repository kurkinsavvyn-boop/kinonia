/* Подставляет реквизиты оператора из js/config.js в юридические страницы.
   Если поле не заполнено, показывается жёлтая подсказка — так сразу видно, что осталось дописать. */
(function () {
  var op = (window.KINONIA_CONFIG && window.KINONIA_CONFIG.operator) || {};
  var hints = {
    name: "полное наименование организации",
    inn: "ИНН",
    ogrn: "ОГРН",
    address: "юридический адрес",
    email: "e-mail для обращений",
    responsible: "ФИО ответственного за обработку данных"
  };
  Array.prototype.forEach.call(document.querySelectorAll("[data-op]"), function (el) {
    var k = el.getAttribute("data-op");
    if (op[k]) { el.textContent = op[k]; return; }
    var m = document.createElement("mark");
    m.textContent = "[укажите: " + (hints[k] || k) + "]";
    el.appendChild(m);
  });
})();
