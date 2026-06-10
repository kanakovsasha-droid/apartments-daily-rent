/* =========================================================================
   КОНФИГУРАЦИЯ — правьте эти значения под себя
   ========================================================================= */
const BRAND_NAME = "Уютные квартиры";      // название бизнеса
const CITY = "Севастополь";                 // город / район
const PHONE = "+7 978 700-29-19";          // телефон (для кнопки «Позвонить»)
const TELEGRAM_USERNAME = "your_username";  // username в Telegram без @ (для ссылки t.me)

/* Готовые ссылки на основе конфига */
const PHONE_HREF = "tel:" + PHONE.replace(/[^\d+]/g, "");
const TELEGRAM_HREF = "https://t.me/" + TELEGRAM_USERNAME;

/* =========================================================================
   ИСТОЧНИК ДАННЫХ ЗАНЯТОСТИ
   getAvailability(apartmentId) инкапсулирует источник занятых дат.
   Сейчас читает локальный data/availability.json.

   TODO: позже эта функция будет ходить в Supabase, а не в локальный JSON.
   Supabase по крону будет парсить iCal-календарь Авито для каждой квартиры
   и складывать занятые даты в таблицу. Тогда тело функции заменится на
   fetch к Supabase REST/RPC по apartmentId — остальной код менять не придётся.
   Пример будущей реализации см. в README.md.
   ========================================================================= */
let _availabilityCache = null;

async function getAvailability(apartmentId) {
  if (!_availabilityCache) {
    const res = await fetch("data/availability.json");
    _availabilityCache = await res.json();
  }
  return _availabilityCache[apartmentId] || [];
}

/* =========================================================================
   УТИЛИТЫ ДАТ
   ========================================================================= */
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

/* Разворачивает массив занятости (даты + диапазоны) в Set строк "YYYY-MM-DD" */
function buildBusySet(availability) {
  const set = new Set();
  for (const item of availability) {
    if (typeof item === "string") {
      set.add(item);
    } else if (item && item.from && item.to) {
      let cur = new Date(item.from + "T00:00:00");
      const end = new Date(item.to + "T00:00:00");
      while (cur <= end) {
        set.add(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return set;
}

/* =========================================================================
   ТОСТ-ПОДСКАЗКА
   ========================================================================= */
let toastTimer = null;
function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

/* =========================================================================
   РЕНДЕР: применяем конфиг к статичным элементам
   ========================================================================= */
function applyConfig() {
  document.title = `${BRAND_NAME} — посуточная аренда квартир в ${CITY}`;
  setText("brandLogo", BRAND_NAME);
  setText("footerBrand", BRAND_NAME);
  setText("footerCity", CITY);
  setText("footerCopy", `© ${new Date().getFullYear()} ${BRAND_NAME}`);

  setHref("headerCall", PHONE_HREF);
  setHref("heroCall", PHONE_HREF);
  setHref("heroTelegram", TELEGRAM_HREF);

  const fp = document.getElementById("footerPhone");
  fp.textContent = PHONE; fp.href = PHONE_HREF;
  const ft = document.getElementById("footerTelegram");
  ft.textContent = "@" + TELEGRAM_USERNAME; ft.href = TELEGRAM_HREF;
}

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setHref(id, href) { const el = document.getElementById(id); if (el) el.href = href; }

/* =========================================================================
   РЕНДЕР: карточки квартир
   ========================================================================= */
function formatPrice(n) {
  return n.toLocaleString("ru-RU") + " ₽";
}

async function renderApartments() {
  const res = await fetch("data/apartments.json");
  const apartments = await res.json();
  const grid = document.getElementById("apartmentsGrid");
  grid.innerHTML = "";

  for (const apt of apartments) {
    const card = document.createElement("article");
    card.className = "apt-card";
    card.id = "apt-" + apt.id;

    const amenities = apt.amenities.map(a => `<span class="amenity">${escapeHtml(a)}</span>`).join("");
    const hasPhotos = Array.isArray(apt.photos) && apt.photos.length > 0;

    card.innerHTML = `
      <div class="apt-gallery" data-index="0">
        <div class="apt-gallery-main">${hasPhotos
          ? `<img src="${escapeHtml(apt.photos[0])}" alt="${escapeHtml(apt.title)}">`
          : "Фото скоро добавим"}</div>
        ${hasPhotos && apt.photos.length > 1 ? `
          <button class="gallery-nav gallery-prev" aria-label="Назад">‹</button>
          <button class="gallery-nav gallery-next" aria-label="Вперёд">›</button>
          <div class="gallery-dots">${apt.photos.map((_, i) => `<span class="${i === 0 ? "active" : ""}"></span>`).join("")}</div>
        ` : ""}
      </div>
      <div class="apt-body">
        <div class="apt-head">
          <h3 class="apt-title">${escapeHtml(apt.title)}</h3>
          <div class="apt-price">${formatPrice(apt.pricePerNight)}<small> / сутки</small></div>
        </div>
        <p class="apt-desc">${escapeHtml(apt.description)}</p>
        <div class="apt-amenities">${amenities}</div>
        <div class="apt-actions">
          <button class="btn btn-ghost check-dates" data-id="${apt.id}">📅 Проверить даты</button>
          <a class="btn btn-primary" href="${PHONE_HREF}">Позвонить</a>
          <a class="btn btn-telegram" href="${TELEGRAM_HREF}" target="_blank" rel="noopener">Telegram</a>
        </div>
        <div class="apt-calendar" id="cal-${apt.id}"></div>
      </div>
    `;
    grid.appendChild(card);

    // галерея фото
    if (hasPhotos && apt.photos.length > 1) initGallery(card, apt);

    // календарь
    await initCalendar(apt.id);
  }

  // «Проверить даты» — скролл к календарю квартиры
  grid.querySelectorAll(".check-dates").forEach(btn => {
    btn.addEventListener("click", () => {
      const cal = document.getElementById("cal-" + btn.dataset.id);
      cal.scrollIntoView({ behavior: "smooth", block: "center" });
      cal.classList.add("flash");
      setTimeout(() => cal.classList.remove("flash"), 800);
    });
  });
}

const GALLERY_INTERVAL = 4500; // мс между автоматическими слайдами

function initGallery(card, apt) {
  const gallery = card.querySelector(".apt-gallery");
  const main = card.querySelector(".apt-gallery-main");
  const dots = card.querySelectorAll(".gallery-dots span");
  const n = apt.photos.length;

  const show = (i) => {
    gallery.dataset.index = i;
    main.innerHTML = `<img src="${escapeHtml(apt.photos[i])}" alt="${escapeHtml(apt.title)}">`;
    dots.forEach((d, di) => d.classList.toggle("active", di === i));
  };
  const go = (delta) => show((+gallery.dataset.index + delta + n) % n);

  // автолистание
  let timer = null;
  const start = () => { timer = setInterval(() => go(1), GALLERY_INTERVAL); };
  const stop = () => { clearInterval(timer); timer = null; };
  const restart = () => { stop(); start(); };

  card.querySelector(".gallery-prev").addEventListener("click", () => { go(-1); restart(); });
  card.querySelector(".gallery-next").addEventListener("click", () => { go(1); restart(); });

  // клик по точкам
  dots.forEach((d, di) => d.addEventListener("click", () => { show(di); restart(); }));

  // пауза при наведении мышью (десктоп)
  gallery.addEventListener("mouseenter", stop);
  gallery.addEventListener("mouseleave", start);

  // свайп пальцем (телефон)
  let touchX = null;
  gallery.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; stop(); }, { passive: true });
  gallery.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX = null;
    restart();
  }, { passive: true });

  start();
}

/* =========================================================================
   КАЛЕНДАРЬ ЗАНЯТОСТИ
   ========================================================================= */
async function initCalendar(apartmentId) {
  const availability = await getAvailability(apartmentId);
  const busy = buildBusySet(availability);

  const now = new Date();
  const state = { year: now.getFullYear(), month: now.getMonth() };
  const container = document.getElementById("cal-" + apartmentId);

  function draw() {
    const { year, month } = state;
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7; // Пн = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(year, month, d);
      const cellDate = new Date(year, month, d);
      const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let cls = "cal-cell ";
      if (isPast) cls += "past";
      else if (busy.has(key)) cls += "busy";
      else cls += "free";
      if (key === todayKey) cls += " today";
      cells += `<div class="${cls}" data-key="${key}">${d}</div>`;
    }

    container.innerHTML = `
      <div class="cal-header">
        <div class="cal-title">Свободные даты</div>
        <div class="cal-nav">
          <button class="cal-prev" aria-label="Предыдущий месяц">‹</button>
          <button class="cal-next" aria-label="Следующий месяц">›</button>
        </div>
      </div>
      <div class="cal-month">${MONTHS[month]} ${year}</div>
      <div class="cal-grid">
        ${DOW.map(d => `<div class="cal-dow">${d}</div>`).join("")}
        ${cells}
      </div>
      <div class="cal-legend">
        <span><i class="dot-free"></i> Свободно</span>
        <span><i class="dot-busy"></i> Занято</span>
      </div>
    `;

    container.querySelector(".cal-prev").addEventListener("click", () => {
      state.month--; if (state.month < 0) { state.month = 11; state.year--; }
      draw();
    });
    container.querySelector(".cal-next").addEventListener("click", () => {
      state.month++; if (state.month > 11) { state.month = 0; state.year++; }
      draw();
    });
    container.querySelectorAll(".cal-cell.free").forEach(cell => {
      cell.addEventListener("click", () => {
        showToast("Свободно — позвоните или напишите, чтобы забронировать");
      });
    });
  }

  // месяц в шапке выводим отдельной строкой над сеткой
  draw();
}

/* =========================================================================
   ЧТО РЯДОМ / ДОСТОПРИМЕЧАТЕЛЬНОСТИ
   ========================================================================= */
async function renderLandmarks() {
  const res = await fetch("data/landmarks.json");
  const landmarks = await res.json();
  const grid = document.getElementById("landmarksGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const l of landmarks) {
    const card = document.createElement("article");
    card.className = "landmark-card";
    card.innerHTML = `
      <img src="${escapeHtml(l.photo)}" alt="${escapeHtml(l.title)}" loading="lazy">
      ${l.credit ? `<span class="landmark-credit">${escapeHtml(l.credit)}</span>` : ""}
      <div class="landmark-overlay">
        <h3 class="landmark-title">${escapeHtml(l.title)}</h3>
        <p class="landmark-desc">${escapeHtml(l.description)}</p>
      </div>
    `;
    grid.appendChild(card);
  }
}

/* =========================================================================
   ОТЗЫВЫ
   ========================================================================= */
async function renderReviews() {
  const res = await fetch("data/reviews.json");
  const reviews = await res.json();
  const grid = document.getElementById("reviewsGrid");
  grid.innerHTML = "";
  for (const r of reviews) {
    const rating = Math.max(0, Math.min(5, r.rating || 5));
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const card = document.createElement("div");
    card.className = "review-card";
    card.innerHTML = `
      <div class="review-stars">${stars}</div>
      <p class="review-text">${escapeHtml(r.text)}</p>
      <div class="review-author">
        <div class="review-avatar">${escapeHtml((r.name || "?").charAt(0))}</div>
        <div class="review-name">${escapeHtml(r.name || "Гость")}</div>
      </div>
    `;
    grid.appendChild(card);
  }
}

/* =========================================================================
   БЕЗОПАСНОСТЬ: экранирование пользовательских строк
   ========================================================================= */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================================================================
   СТАРТ
   ========================================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  applyConfig();
  try {
    await renderApartments();
    await renderLandmarks();
    await renderReviews();
  } catch (e) {
    console.error("Ошибка загрузки данных:", e);
  }
});
