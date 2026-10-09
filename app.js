/* =========================================================
   ORBE C FILMS — PLANIFICADOR DE OBRA
   APP.JS COMPLETO — V3
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {
  sheetsUrl:
    "https://script.google.com/macros/s/AKfycbxjMSqsRzFsDyKbHjw6mOeq8GgTtvm5DSgd8PMPV5pEb-lF_SCdfhJnASn6IFZsHFjhDg/exec",

  projectStart: "2026-10-16"
};

const $ = id => document.getElementById(id);

const state = {
  activities: [],
  employees: [],
  yields: [],
  organizer: [],

  projects: [],
  allPlans: [],

  plannedActivities: [],
  selectedEmployees: [],
  editingPlanId: "",

  currentProject: null,

  currentView: "semanas",

  connected: false,

  nextId: 1
};


/* =========================================================
   UTILIDADES
========================================================= */

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  let text = String(value).trim().replace(/\s/g, "");
  if (!text) return fallback;

  if (text.includes(",") && text.includes(".")) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    const parts = text.split(",");
    text = parts.length === 2 && parts[1].length <= 2
      ? parts[0] + "." + parts[1]
      : parts.join("");
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}


function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatCompact(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "";
  }

  if (Number.isInteger(n)) {
    return String(n);
  }

  return n
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}


function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value).trim();
  let y, m, d;

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
    return new Date(y, m - 1, d);
  }

  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDate(value) {
  const d = parseDate(value);

  if (!d) {
    return "—";
  }

  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function formatDateShort(value) {
  const d = parseDate(value);

  if (!d) {
    return "—";
  }

  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "2-digit"
  });
}


function formatISODate(value) {
  const d = parseDate(value);

  if (!d) {
    return "";
  }

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}


function isWorkingDay(value) {
  const d = parseDate(value);
  if (!d) return false;
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function nextWorkingDay(value) {
  let d = parseDate(value);
  if (!d) return null;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

function addWorkDays(value, amount) {
  let d = nextWorkingDay(value);
  if (!d) return null;
  let remaining = Math.max(0, Math.floor(Number(amount) || 0));
  while (remaining > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
}

function addDays(value, amount) {
  const d = parseDate(value);

  if (!d) {
    return null;
  }

  d.setDate(
    d.getDate() + amount
  );

  return d;
}


function daysBetween(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);

  if (!a || !b) {
    return 0;
  }

  return (
    Math.floor(
      (b - a) / 86400000
    ) + 1
  );
}

function workingDaysBetween(start, end) {
  let a = nextWorkingDay(start);
  const b = parseDate(end);
  if (!a || !b || a > b) return 0;
  let count = 0;
  while (a <= b) {
    if (isWorkingDay(a)) count++;
    a = addDays(a, 1);
  }
  return count;
}


function unitsMatch(a, b) {
  const normalizeUnit = value =>
    normalize(value)
      .replace(/²/g, "2")
      .replace(/³/g, "3")
      .replace(/\s+/g, "");

  const x = normalizeUnit(a);
  const y = normalizeUnit(b);

  if (x === y) {
    return true;
  }

  const groups = [
    ["m2", "m²", "metrocuadrado", "metroscuadrados"],
    ["m3", "m³", "metrocubico", "metroscubicos"],
    ["ml", "mlineal", "mlineales"],
    ["c/u", "cu", "un", "unidad", "unidades"],
    ["sg", "sumaglobal"]
  ];

  return groups.some(group => {
    const normalized =
      group.map(normalizeUnit);

    return (
      normalized.includes(x) &&
      normalized.includes(y)
    );
  });
}


/* =========================================================
   JSONP
========================================================= */

function loadJSONP(url) {

  return new Promise(
    (resolve, reject) => {

      const callback =
        `orbe_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`;

      const script =
        document.createElement("script");

      let finished = false;

      function finish() {

        if (finished) {
          return;
        }

        finished = true;

        clearTimeout(timeout);

        delete window[callback];

        script.remove();
      }

      const timeout =
        setTimeout(() => {

          finish();

          reject(
            new Error(
              "Tiempo de espera agotado al conectar con Google Sheets."
            )
          );

        }, 15000);


      window[callback] =
        data => {

          finish();

          if (
            data &&
            data.ok === false
          ) {

            reject(
              new Error(
                data.error ||
                "Google Sheets devolvió un error."
              )
            );

            return;
          }

          resolve(data);
        };


      script.onerror = () => {

        finish();

        reject(
          new Error(
            "No se pudo conectar con Google Sheets."
          )
        );
      };


      script.src =
        `${url}${url.includes("?") ? "&" : "?"}callback=${callback}`;

      document.body.appendChild(script);
    }
  );
}


function api(
  action,
  data = null,
  id = ""
) {

  let url =
    `${CONFIG.sheetsUrl}?action=${encodeURIComponent(action)}`;

  if (id) {

    url +=
      `&id=${encodeURIComponent(id)}`;
  }

  if (data) {

    url +=
      `&data=${encodeURIComponent(
        JSON.stringify(data)
      )}`;
  }

  return loadJSONP(url);
}


function getSheetArray(
  data,
  names
) {

  for (const name of names) {

    if (
      Array.isArray(
        data?.[name]
      )
    ) {

      return data[name];
    }
  }

  return [];
}


/* =========================================================
   NORMALIZADORES
========================================================= */

function normalizeActivity(raw) {

  return {

    id:
      raw.ID ??
      raw.id ??
      "",

    phase:
      raw["Frente / zona"] ??
      raw["FRENTE / ZONA"] ??
      raw.FASE ??
      raw.fase ??
      "",

    subarea:
      raw["Subárea"] ??
      raw.SUBÁREA ??
      raw.subarea ??
      "",

    name:
      raw["ACTIVIDAD PARA PLANIFICACIÓN"] ??
      raw["Actividad"] ??
      raw.ACTIVIDAD ??
      raw.actividad ??
      "",

    quantity:
      number(
        raw["Cantidad"] ??
        raw.CANTIDAD ??
        raw.cantidad
      ),

    unit:
      raw["Unidad"] ??
      raw.UNIDAD ??
      raw.unidad ??
      "",

    scope:
      raw["Alcance / especificación original"] ??
      raw.alcance ??
      "",

    observation:
      raw["Observación de la oferta"] ??
      raw.observacion ??
      "",

    criterion:
      raw.Criterio ??
      raw.criterio ??
      ""
  };
}


function normalizeEmployee(raw) {

  const read = (...names) => {
    const wanted = names.map(name => normalize(name));

    const entry =
      Object.entries(raw || {}).find(
        ([key]) =>
          wanted.includes(
            normalize(key)
          )
      );

    return entry ? entry[1] : "";
  };

  return {
    id: String(read("ID")).trim(),
    name: String(read("NOMBRE", "NOMBRE COMPLETO")).trim(),
    trade: String(read("OFICIO", "ESPECIALIDAD", "PUESTO")).trim(),
    role: String(read("ROL", "CARGO")).trim()
  };
}


function normalizeYield(raw) {

  return {

    id:
      raw.ID ??
      raw.id ??
      "",

    activity:
      raw.ACTIVIDAD ??
      raw.actividad ??
      "",

    yield:
      number(
        raw.RENDIMIENTO ??
        raw.rendimiento
      ),

    unit:
      raw.UNIDAD ??
      raw.unidad ??
      "",

    yieldUnit:
      raw["UNIDAD RENDIMIENTO"] ??
      raw.unidadRendimiento ??
      "",

    trade:
      raw.OFICIO ??
      raw.oficio ??
      ""
  };
}


function normalizeOrganizer(raw) {

  return {

    phase:
      raw.FASE ??
      raw.fase ??
      "",

    activity:
      raw.ACTIVIDAD ??
      raw.actividad ??
      "",

    manager:
      raw.ENCARGADO ??
      raw.encargado ??
      "",

    start:
      raw.INICIO ??
      raw.inicio ??
      "",

    end:
      raw.FIN ??
      raw.fin ??
      "",

    team:
      raw.EQUIPO ??
      raw.equipo ??
      ""
  };
}


function normalizeProject(raw) {

  return {

    id:
      raw.ID_PROYECTO ??
      raw.id ??
      "",

    name:
      raw.NOMBRE ??
      raw.nombre ??
      "",

    location:
      raw.UBICACION ??
      raw.ubicacion ??
      "",

    type:
      raw.TIPO ??
      raw.tipo ??
      "Construcción",

    start:
      raw.INICIO ??
      raw.inicio ??
      CONFIG.projectStart,

    end:
      raw.FIN ??
      raw.fin ??
      "",

    status:
      raw.ESTADO ??
      raw.estado ??
      "Activo",

    created:
      raw.FECHA_CREACION ??
      raw.fechaCreacion ??
      "",

    updated:
      raw.FECHA_ACTUALIZACION ??
      raw.fechaActualizacion ??
      ""
  };
}


function normalizePlan(raw) {
  const team = raw.EQUIPO ?? raw.equipo ?? "";
  const employeeIds = Array.isArray(team)
    ? team.map(String).filter(Boolean)
    : String(team).split(",").map(v => v.trim()).filter(Boolean);

  const dependencyId = raw.DEPENDENCIA ?? raw.dependencyId ?? "";

  return {
    id: raw.ID_PLAN ?? raw.id ?? "",
    projectId: raw.ID_PROYECTO ?? raw.projectId ?? "",
    activityId: raw.ID_ACTIVIDAD ?? raw.activityId ?? "",
    phase: raw.FASE ?? raw.phase ?? "",
    subarea: raw.SUBÁREA ?? raw.SUBAREA ?? raw.subarea ?? "",
    name: raw.ACTIVIDAD ?? raw.name ?? "",
    quantity: number(raw.CANTIDAD ?? raw.quantity),
    unit: raw.UNIDAD ?? raw.unit ?? "",
    yield: number(raw.RENDIMIENTO ?? raw.yield),
    yieldUnit: raw.UNIDAD_RENDIMIENTO ?? raw.yieldUnit ?? "",
    duration: number(raw.DURACION ?? raw.duration, 1),
    start: parseDate(raw.INICIO ?? raw.start),
    end: parseDate(raw.FIN ?? raw.end),
    shift: raw.TURNO ?? raw.shift ?? "Diurno",
    dependencyId,
    dependencyName:
      raw.dependencyName ||
      state.plannedActivities?.find(
        item => String(item.id) === String(dependencyId)
      )?.name ||
      "",
    manager: raw.ENCARGADO ?? raw.manager ?? "",
    employees: employeeIds,
    status: raw.ESTADO ?? raw.status ?? "Pendiente"
  };
}


/* =========================================================
   CONEXIÓN
========================================================= */

async function loadSheets() {

  setConnection(
    "Conectando con Google Sheets…",
    "loading"
  );

  try {

    const data =
      await loadJSONP(
        CONFIG.sheetsUrl
      );


    state.activities =
      getSheetArray(
        data,
        [
          "activities",
          "actividades",
          "ACTIVIDADES DE OBRA",
          "items"
        ]
      )
        .map(
          normalizeActivity
        )
        .filter(
          item => item.name
        );


     state.employees =
      getSheetArray(
        data,
        [
          "employees",
          "empleados",
          "EMPLEADOS"
        ]
      )
        .map(
          normalizeEmployee
        )
        .filter(
          item => item.name
        )
        .map(
          (item, index) => ({
            ...item,
            __plannerKey:
              String(
                item.id || ""
              ).trim() ||
              `EMP-UI-${index + 1}`
          })
        );

    state.yields =
      getSheetArray(
        data,
        [
          "yields",
          "rendimientos",
          "RENDIMIENTOS"
        ]
      )
        .map(
          normalizeYield
        )
        .filter(
          item => item.activity
        );


    state.organizer =
      getSheetArray(
        data,
        [
          "organizer",
          "organizador",
          "ORGANIZADOR"
        ]
      )
        .map(
          normalizeOrganizer
        );


    state.projects =
      getSheetArray(
        data,
        [
          "projects",
          "PROYECTOS"
        ]
      )
        .map(
          normalizeProject
        );


    state.allPlans =
      getSheetArray(
        data,
        [
          "plannedActivities",
          "PLAN_ACTIVIDADES"
        ]
      )
        .map(
          normalizePlan
        );


    state.connected = true;

    populateActivities();
    populateManagers();
    renderEmployeeSelector();
    updateCounts();
    if (typeof window.refreshScenarioActivities === "function") {
      window.refreshScenarioActivities();
    }

    setConnection(
      "Google Sheets conectado",
      "ok"
    );

  } catch (error) {

    console.error(error);

    state.connected = false;

    setConnection(
      "Error de conexión",
      "error"
    );
  }
}


function setConnection(
  text,
  status
) {

  [
    "connectionText",
    "status",
    "sheetStatusText"
  ].forEach(id => {

    const el = $(id);

    if (!el) {
      return;
    }

    el.textContent = text;

    el.classList.remove(
      "ok",
      "error",
      "loading"
    );

    if (status) {
      el.classList.add(
        status
      );
    }
  });
}


function updateCounts() {

  if ($("navCount")) {

    $("navCount").textContent =
      state.activities.length;
  }

  if ($("sheetStatusText")) {

    $("sheetStatusText").textContent =
      `${state.activities.length} actividades · ` +
      `${state.employees.length} empleados · ` +
      `${state.yields.length} rendimientos`;
  }
}


/* =========================================================
   ACTIVIDADES
========================================================= */

function populateActivities() {

  const select =
    $("plannerActivity");

  if (!select) {
    return;
  }

  select.innerHTML =
    `<option value="">
      Selecciona una actividad…
    </option>`;


  let lastPhase = "";

  let group = null;


  state.activities.forEach(
    (activity, index) => {

      const phase =
        activity.phase ||
        "Sin fase";


      if (
        phase !== lastPhase
      ) {

        group =
          document.createElement(
            "optgroup"
          );

        group.label =
          phase;

        select.appendChild(
          group
        );

        lastPhase =
          phase;
      }


      const option =
        document.createElement(
          "option"
        );

      option.value =
        index;

      option.textContent =
        `${activity.name} · ` +
        `${formatCompact(
          activity.quantity
        )} ${activity.unit}`;

      group.appendChild(
        option
      );
    }
  );
}


function findYield(activity) {

  if (!activity) {
    return null;
  }

  const activityName =
    normalize(activity.name);

  const exactByUnit =
    state.yields.find(item =>
      unitsMatch(item.unit, activity.unit) &&
      normalize(item.activity) === activityName &&
      Number(item.yield) > 0
    );

  if (exactByUnit) {
    return exactByUnit;
  }

  const exact =
    state.yields.find(item =>
      normalize(item.activity) === activityName &&
      Number(item.yield) > 0
    );

  if (exact) {
    return exact;
  }

  const relatedByUnit =
    state.yields.find(item => {

      if (
        !unitsMatch(
          item.unit,
          activity.unit
        )
      ) {
        return false;
      }

      if (Number(item.yield) <= 0) {
        return false;
      }

      const yieldName =
        normalize(item.activity);

      return (
        activityName.includes(yieldName) ||
        yieldName.includes(activityName)
      );
    });

  if (relatedByUnit) {
    return relatedByUnit;
  }

  const related =
    state.yields.find(item => {

      if (Number(item.yield) <= 0) {
        return false;
      }

      const yieldName =
        normalize(item.activity);

      return (
        activityName.includes(yieldName) ||
        yieldName.includes(activityName)
      );
    });

  if (related) {
    return related;
  }

  const words =
    activityName
      .split(" ")
      .filter(word => word.length >= 4);

  return (
    state.yields.find(item =>
      Number(item.yield) > 0 &&
      words.some(word =>
        normalize(item.activity)
          .includes(word)
      )
    ) || null
  );
}
function renderActivityInfo(
  activity = null,
  recommendation = null
) {

  const box =
    $("plannerActivityInfo");

  if (!box) {
    return;
  }


  if (!activity) {

    box.textContent =
      "Selecciona una actividad para cargar su cantidad, unidad y rendimiento.";

    return;
  }


  const base =
    `${formatCompact(
      activity.quantity
    )} ${activity.unit || "unidad"}`;


  if (recommendation) {

    box.textContent =
      `${base} · Rendimiento: ` +
      `${formatCompact(
        recommendation.yield
      )} ${activity.unit}/persona/día`;

  } else {

    box.textContent =
      `${base} · Esta actividad todavía no tiene rendimiento registrado.`;
  }
}


function onActivitySelected() {

  const select =
    $("plannerActivity");

  if (!select) {
    return;
  }


  const index =
    Number(
      select.value
    );


  const activity =
    state.activities[index];


  if (
    select.value === "" ||
    !activity
  ) {

    clearActivityForm(
      false
    );

    return;
  }


  const recommendation =
    findYield(
      activity
    );


  if ($("plannerPhase")) {

    $("plannerPhase").value =
      activity.phase || "";
  }


  if ($("plannerDependency")) {

    $("plannerDependency").value =
      "";
  }


  renderActivityInfo(
    activity,
    recommendation
  );

  calculatePlannerRequirement();
}


/* =========================================================
   EMPLEADOS
========================================================= */

function getSelectedEmployees() {

  return state.selectedEmployees.map(
    employee => ({
      id: employee.id,
      name: employee.name,
      trade: employee.trade,
      role: employee.role
    })
  );
}

function employeeSelectionKey(employee) {

  return String(
    employee?.__plannerKey ||
    employee?.id ||
    ""
  ).trim();
}

function renderEmployeeSelector() {

  const container = $("plannerEmployees");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const toolbar = document.createElement("div");
  toolbar.className = "employee-selector-toolbar";

  toolbar.innerHTML = `
    <span>${state.selectedEmployees.length} seleccionado(s)</span>

    <button type="button" id="selectAllEmployees">
      Seleccionar todos
    </button>

    <button type="button" id="clearAllEmployees">
      Limpiar
    </button>
  `;

  container.appendChild(toolbar);

  const list = document.createElement("div");
  list.className = "employee-list";

  if (!state.employees.length) {
    list.innerHTML =
      `<span class="empty-selection">No hay empleados cargados.</span>`;

    container.appendChild(list);
    return;
  }

  state.employees.forEach(employee => {

    const key = employeeSelectionKey(employee);

    const label = document.createElement("label");
    label.className = "employee-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked =
      state.selectedEmployees.some(
        item =>
          employeeSelectionKey(item) === key
      );

    checkbox.addEventListener("change", () => {

      if (checkbox.checked) {

        const exists =
          state.selectedEmployees.some(
            item =>
              employeeSelectionKey(item) === key
          );

        if (!exists) {
          state.selectedEmployees.push(employee);
        }

      } else {

        state.selectedEmployees =
          state.selectedEmployees.filter(
            item =>
              employeeSelectionKey(item) !== key
          );
      }

      renderEmployeeSelector();
      calculatePlannerRequirement();
    });

    const preview = getPreviewRange();
    const shift =
      $("plannerShift")?.value || "Diurno";

    state._availabilityShift = shift;

    const busy =
      preview &&
      typeof window.employeeBusyAcrossProjects === "function"
        ? window.employeeBusyAcrossProjects(
            employee.id,
            preview.start,
            preview.end,
            state.editingPlanId || ""
          )
        : false;

    const initials =
      String(employee.name || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase();

    const avatar = document.createElement("span");
    avatar.className = "employee-avatar";
    avatar.textContent = initials || "?";

    const text = document.createElement("span");
    text.className = "employee-text";

    text.innerHTML = `
      <strong>
        ${escapeHTML(employee.name || "Sin nombre")}
      </strong>

      <small>
        ${escapeHTML(
          employee.trade ||
          employee.role ||
          "Sin oficio"
        )}
      </small>

      <em class="employee-availability ${busy ? "busy" : "available"}">
        <i></i>
        ${preview
          ? (busy ? "Ocupado" : "Disponible")
          : "Disponible"}
      </em>
    `;

    label.appendChild(checkbox);
    label.appendChild(avatar);
    label.appendChild(text);

    list.appendChild(label);
  });

  container.appendChild(list);

  $("selectAllEmployees")
    ?.addEventListener("click", () => {

      state.selectedEmployees =
        state.employees.map(
          employee => ({ ...employee })
        );

      renderEmployeeSelector();
      calculatePlannerRequirement();
    });

  $("clearAllEmployees")
    ?.addEventListener("click", () => {

      state.selectedEmployees = [];

      renderEmployeeSelector();
      calculatePlannerRequirement();
    });
}

function populateManagers() {

  const select =
    $("plannerManager");

  if (!select) {
    return;
  }


  select.innerHTML =
    `<option value="">
      Seleccionar encargado
    </option>`;


  state.employees.forEach(
    employee => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        employee.name;

      option.textContent =
        employee.name;

      select.appendChild(
        option
      );
    }
  );
}


/* =========================================================
   DURACIÓN / RENDIMIENTO
========================================================= */

function getInputDurationDays() {

  const raw =
    number(
      $("plannerDuration")?.value,
      0
    );


  if (raw <= 0) {
    return 0;
  }


  const unit =
    $("plannerDurationUnit")?.value ||
    "dias";


  const shift =
    $("plannerShift")?.value ||
    "Diurno";


  if (
    unit === "semanas"
  ) {

    return raw * 5;
  }


  if (
    unit === "horas"
  ) {

    const hoursPerDay =
      shift === "Ambos"
        ? 15
        : shift === "Nocturno"
          ? 7
          : 8;

    return raw / hoursPerDay;
  }


  return raw;
}


function estimateDuration(
  activity,
  recommendation
) {

  if (
    !activity ||
    !recommendation ||
    !recommendation.yield ||
    !state.selectedEmployees.length
  ) {

    return 0;
  }


  return (
    activity.quantity /
    (
      recommendation.yield *
      state.selectedEmployees.length
    )
  );
}


function calculatePlannerRequirement() {

  const info =
    $("employeeRequirement");

  if (!info) {
    return;
  }


  const index =
    Number(
      $("plannerActivity")?.value
    );


  const activity =
    state.activities[index];


  const recommendation =
    findYield(activity) ||
    getLegacyRecommendedYield(activity);


  const enteredDays =
    getInputDurationDays();


  if (
    !activity ||
    !recommendation ||
    !recommendation.yield
  ) {

    info.textContent =
      "Selecciona una actividad para calcular los recursos necesarios.";

    return;
  }


  if (
    enteredDays > 0
  ) {

    const needed =
      Math.max(
        1,
        Math.ceil(
          activity.quantity /
          (
            recommendation.yield *
            enteredDays
          )
        )
      );


    const rawDuration =
      number(
        $("plannerDuration")?.value,
        enteredDays
      );

    const durationUnit =
      $("plannerDurationUnit")?.value ||
      "dias";

    const unitLabel =
      durationUnit === "semanas"
        ? "semana(s)"
        : durationUnit === "horas"
          ? "hora(s)"
          : "día(s)";


    info.textContent =
      `Necesitas al menos ${needed} ${
        needed === 1
          ? "empleado"
          : "empleados"
      } para completar la actividad en ${
        formatCompact(rawDuration)
      } ${unitLabel}.`;

    return;
  }


  if (
    state.selectedEmployees.length
  ) {

    const duration =
      estimateDuration(
        activity,
        recommendation
      );


    const estimatedDays =
      Math.max(
        1,
        Math.ceil(duration)
      );


    info.textContent =
      `Con: ${state.selectedEmployees.length} personas · duración estimada ${estimatedDays} día(s).`;

    return;
  }


  info.textContent =
    `Rendimiento base: ${formatCompact(
      recommendation.yield
    )} ${activity.unit}/persona/día.`;
}
function clearActivityForm(
  clearActivity = true
) {

  if (
    clearActivity &&
    $("plannerActivity")
  ) {

    $("plannerActivity").value =
      "";
  }


  if ($("plannerPhase")) {

    $("plannerPhase").value =
      "";
  }


  if ($("plannerDependency")) {

    $("plannerDependency").value =
      "";
  }


  if ($("plannerDuration")) {

    $("plannerDuration").value =
      "";
  }


  if ($("plannerManager")) {

    $("plannerManager").value =
      "";
  }


  state.selectedEmployees =
    [];


  renderEmployeeSelector();

  renderActivityInfo();

  calculatePlannerRequirement();
}


/* =========================================================
   TURNO
========================================================= */
function syncShiftButtons() {

  const select =
    $("plannerShift");

  if (!select) {
    return;
  }

  const value =
    select.value || "Diurno";


  document
    .querySelectorAll(
      "#shiftControl .shift-option"
    )
    .forEach(
      button => {

        const shift =
          button.dataset.shift;

        button.classList.toggle(
          "active",
          value === shift ||
          (
            value === "Ambos" &&
            (
              shift === "Diurno" ||
              shift === "Nocturno"
            )
          )
        );
      }
    );
}



function injectShiftControl() {

  const select =
    $("plannerShift");

  if (!select) {
    return;
  }

  const field =
    select.closest(".field");

  if (!field) {
    return;
  }

  let control =
    field.querySelector("#shiftControl");

  if (!control) {

    control =
      document.createElement("div");

    control.id =
      "shiftControl";

    control.className =
      "shift-control";

    control.innerHTML = `
      <button
        type="button"
        class="shift-option"
        data-shift="Diurno"
      >
        <span>☀</span>
        <b>Diurno</b>
        <small>09:00–17:00</small>
      </button>

      <button
        type="button"
        class="shift-option"
        data-shift="Nocturno"
      >
        <span>☾</span>
        <b>Nocturno</b>
        <small>17:00–24:00</small>
      </button>
    `;

    field.insertBefore(
      control,
      select
    );

    control
      .querySelectorAll(".shift-option")
      .forEach(button => {

        button.addEventListener(
          "click",
          event => {

            event.preventDefault();
            event.stopPropagation();

            const clicked =
              button.dataset.shift;

            const current =
              select.value ||
              "Diurno";

            if (
              current === "Ambos"
            ) {

              select.value =
                clicked === "Diurno"
                  ? "Nocturno"
                  : "Diurno";

            } else if (
              current === clicked
            ) {

              select.value =
                clicked;

            } else {

              select.value =
                "Ambos";
            }

            syncShiftButtons();

            state._availabilityShift =
              select.value;

            calculatePlannerRequirement();

            renderEmployeeSelector();
          }
        );
      });
  }

  if (
    !select.querySelector(
      'option[value="Ambos"]'
    )
  ) {

    const ambos =
      document.createElement("option");

    ambos.value = "Ambos";
    ambos.textContent = "Ambos";

    select.appendChild(ambos);
  }

  select.classList.add(
    "shift-native-hidden"
  );

  syncShiftButtons();
}
/* =========================================================
   DEPENDENCIAS
========================================================= */

function populateDependencies() {

  const select =
    $("plannerDependency");

  if (!select) {
    return;
  }


  select.innerHTML =
    `<option value="">
      Sin dependencia
    </option>`;


  state.plannedActivities.forEach(
    (activity, index) => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        index;

      option.textContent =
        `${index + 1}. ${activity.name}`;

      select.appendChild(
        option
      );
    }
  );
}


function getDependency() {

  const value =
    $("plannerDependency")
      ?.value;


  if (
    value === "" ||
    value === undefined
  ) {

    return null;
  }


  return (
    state.plannedActivities[
      Number(value)
    ] ||
    null
  );
}


function dependencyWouldCycle(activityId, dependencyId) {
  if (!activityId || !dependencyId) return false;
  let current = String(dependencyId);
  const seen = new Set();

  while (current) {
    if (current === String(activityId)) return true;
    if (seen.has(current)) return true;
    seen.add(current);

    const item = state.plannedActivities.find(
      x => String(x.id) === current
    );
    current = item?.dependencyId ? String(item.dependencyId) : "";
  }
  return false;
}

function calculateStartDate() {

  const dependency =
    getDependency();


  if (
    dependency &&
    dependency.end
  ) {

    return addWorkDays(
      dependency.end,
      1
    );
  }


  return nextWorkingDay(
    state.currentProject?.start ||
    CONFIG.projectStart
  );
}

function validateProjectEnd(end) {
  const projectEnd = parseDate(state.currentProject?.end);
  const activityEnd = parseDate(end);
  if (!projectEnd || !activityEnd) return true;
  return activityEnd <= projectEnd;
}

function getProjectEndMessage(end) {
  const projectEnd = parseDate(state.currentProject?.end);
  const activityEnd = parseDate(end);
  if (!projectEnd || !activityEnd || activityEnd <= projectEnd) return "";
  return `La actividad termina el ${formatDate(activityEnd)}, después del fin del proyecto (${formatDate(projectEnd)}).`;
}

function getPreviewRange() {
  const activity = state.activities[Number($("plannerActivity")?.value)];
  if (!activity) return null;
  const recommendation = findYield(activity);
  if (!recommendation?.yield) return null;
  const entered = getInputDurationDays();
  const estimated = estimateDuration(activity, recommendation);
  const duration = Math.max(1, Math.ceil(entered > 0 ? entered : estimated));
  const start = calculateStartDate();
  const end = addWorkDays(start, duration - 1);
  return { start, end };
}



/* =========================================================
   PLANIFICAR
========================================================= */

function planToPayload(
  planned
) {

  return {

    ID_PLAN:
      planned.sheetId ||
      planned.id ||
      "",

    ID_PROYECTO:
      state.currentProject.id,

    ID_ACTIVIDAD:
      planned.activityId,

    FASE:
      planned.phase,

    SUBÁREA:
      planned.subarea || "",

    ACTIVIDAD:
      planned.name,

    CANTIDAD:
      planned.quantity,

    UNIDAD:
      planned.unit,

    RENDIMIENTO:
      planned.yield ||
      "",

    UNIDAD_RENDIMIENTO:
      planned.yieldUnit ||
      "",

    DURACION:
      planned.duration,

    INICIO:
      formatISODate(
        planned.start
      ),

    FIN:
      formatISODate(
        planned.end
      ),

    ENCARGADO:
      planned.manager || "",

    TURNO:
      planned.shift ||
      "Diurno",

    DEPENDENCIA:
      planned.dependencyId ||
      "",

    EQUIPO:
      (planned.employees || [])
        .map(
          employee =>
            typeof employee === "object"
              ? employee.id
              : employee
        )
        .filter(Boolean)
        .join(","),

    ESTADO:
      planned.status ||
      "Pendiente"
  };
}


async function savePlan(
  planned
) {

  const result =
    await api(
      "saveActivity",
      planToPayload(
        planned
      )
    );


  planned.id =
    result.id;

  planned.sheetId =
    result.id;


  const normalized =
    normalizePlan({
      ...planToPayload(
        planned
      ),

      ID_PLAN:
        result.id
    });


  const index =
    state.allPlans.findIndex(
      item =>
        String(item.id) ===
        String(result.id)
    );


  if (
    index >= 0
  ) {

    state.allPlans[index] =
      normalized;

  } else {

    state.allPlans.push(
      normalized
    );
  }


  return result;
}


async function addPlannerActivity() {

  const activityIndex =
    Number($("plannerActivity")?.value);

  const activity =
    state.activities[activityIndex];

  if (!activity) {
    alert("Selecciona una actividad.");
    return;
  }

  if (!state.selectedEmployees.length) {
    alert("Selecciona al menos un empleado para formar el equipo.");
    return;
  }

  const recommendation =
    findYield(activity);

  if (!recommendation || !recommendation.yield) {
    alert("Esta actividad no tiene rendimiento registrado.");
    return;
  }

  const enteredDays =
    getInputDurationDays();

  const automaticDays =
    estimateDuration(
      activity,
      recommendation
    );

  const durationDays =
    enteredDays > 0
      ? enteredDays
      : automaticDays;

  if (durationDays <= 0) {
    alert("No se pudo calcular una duración válida.");
    return;
  }

  const start =
    calculateStartDate();

  const end =
    addWorkDays(
      start,
      Math.max(
        1,
        Math.ceil(durationDays)
      ) - 1
    );

  if (
    state.currentProject &&
    !validateProjectEnd(end)
  ) {
    alert(getProjectEndMessage(end));
    return;
  }

  if (
    state.currentProject &&
    alertBusyEmployees(start, end, "")
  ) {
    return;
  }

  const dependency =
    getDependency();

  const planned = {
    id: `LOCAL-${Date.now()}`,
    sheetId: "",
    projectId:
      state.currentProject?.id || "",
    activityId:
      activity.id,
    phase:
      activity.phase,
    subarea:
      activity.subarea,
    name:
      activity.name,
    quantity:
      activity.quantity,
    unit:
      activity.unit,
    manager:
      $("plannerManager")?.value || "",
    start,
    end,
    duration:
      Math.max(
        1,
        Math.ceil(durationDays)
      ),
    dependencyId:
      dependency?.id || null,
    dependencyName:
      dependency?.name || "",
    employees:
      getSelectedEmployees(),
    yield:
      recommendation.yield,
    yieldUnit:
      recommendation.yieldUnit || "",
    shift:
      $("plannerShift")?.value || "Diurno",
    status:
      "Pendiente"
  };

  state.plannedActivities.push(
    planned
  );

  populateDependencies();
  renderAllPlannerViews();
  clearActivityForm(false);
}
async function savePlannerPlanning(){

  if(!state.plannedActivities.length){
    alert(
      "Agrega al menos una actividad antes de guardar la planificación."
    );
    return;
  }

  /*
   * Si todavía no existe proyecto,
   * primero pedimos sus datos.
   */
  if(!state.currentProject){

    state._pendingSavePlanning = true;
    state._pendingDrafts = [
      ...state.plannedActivities
    ];

    openProjectGate();
    showProjectSection("form");

    return;
  }

  const button =
    $("savePlannerPlanning");

  if(button){
    button.disabled = true;
    button.textContent = "Guardando…";
  }

  try{

    recalculateAllDates();

    for(
      const plan of state.plannedActivities
    ){

      plan.projectId =
        state.currentProject.id;

      await savePlan(plan);
    }

    renderAllPlannerViews();

    alert(
      "Planificación guardada correctamente."
    );

  }catch(error){

    console.error(error);

    alert(
      "No se pudo guardar la planificación:\n\n" +
      error.message
    );

  }finally{

    if(button){

      button.disabled = false;
      button.textContent =
        "💾 Guardar planificación";
    }
  }
}
async function removePlannerActivity(
  id
) {

  const index =
    state.plannedActivities.findIndex(
      item =>
        String(item.id) ===
        String(id)
    );


  if (
    index < 0
  ) {

    return;
  }


  const planned =
    state.plannedActivities[index];


  if (
    !confirm(
      `¿Eliminar "${planned.name}" del proyecto?`
    )
  ) {

    return;
  }


  try {

    if (
      planned.sheetId
    ) {

      await api(
        "deleteActivity",
        null,
        planned.sheetId
      );


      state.allPlans =
        state.allPlans.filter(
          item =>
            String(item.id) !==
            String(planned.sheetId)
        );
    }


    state.plannedActivities.splice(
      index,
      1
    );


    const affected =
      state.plannedActivities.filter(
        item =>
          String(
            item.dependencyId
          ) ===
          String(id)
      );


    affected.forEach(
      item => {

        item.dependencyId =
          null;

        item.dependencyName =
          "";
      }
    );


    recalculateAllDates();


    for (const item of state.plannedActivities) {
      if (item.sheetId) await savePlan(item);
    }


    populateDependencies();

    renderAllPlannerViews();


  } catch (error) {

    console.error(error);

    alert(
      "No se pudo eliminar la actividad:\n\n" +
      error.message
    );
  }
}


function recalculateAllDates() {
  const activities = state.plannedActivities || [];
  const byId = new Map(activities.map(a => [String(a.id), a]));
  const done = new Set();
  let guard = 0;

  function visit(activity) {
    const id = String(activity.id);
    if (done.has(id)) return;
    if (guard++ > activities.length * 3) return;

    let start = nextWorkingDay(
      state.currentProject?.start || CONFIG.projectStart
    );

    if (activity.dependencyId) {
      const dependency = byId.get(String(activity.dependencyId));
      if (dependency) {
        visit(dependency);
        start = addWorkDays(dependency.end, 1);
      }
    }

    activity.start = start;
    activity.end = addWorkDays(
      start,
      Math.max(1, Number(activity.duration) || 1) - 1
    );
    done.add(id);
  }

  activities.forEach(visit);
}

/* =========================================================
   DEPENDENCIAS VISUALES
========================================================= */

function renderDependencyScheme() {
  const container = $("dependencyScheme");
  if (!container) return;
  const activities = state.plannedActivities || [];
  if (!activities.length) {
    container.innerHTML = `<div class="visual-empty"><span>01</span><strong>Todavía no hay actividades planificadas</strong><p>Agrega una actividad para comenzar.</p></div>`;
    return;
  }
  const byId = new Map(activities.map(item => [String(item.id), item]));
  const children = new Map();
  activities.forEach(item => {
    const dep = item.dependencyId ? String(item.dependencyId) : "";
    if (!children.has(dep)) children.set(dep, []);
    children.get(dep).push(item);
  });
  const visited = new Set();
  const renderNode = item => {
    const id = String(item.id);
    if (visited.has(id)) return "";
    visited.add(id);
    const dependency = item.dependencyName || "Inicio del proyecto";
    const kids = (children.get(id) || []).filter(child => String(child.id) !== id);
    const kidMarkup = kids.length ? `<div class="dependency-link">↓ continúa con</div><div class="dependency-tree-children">${kids.map(renderNode).join("")}</div>` : "";
    return `<div class="dependency-tree-item"><div class="dependency-node"><div class="dependency-number">${String(activities.indexOf(item)+1).padStart(2,"0")}</div><div class="dependency-body"><div class="dependency-top"><strong>${escapeHTML(item.name)}</strong><span style="display:flex;gap:5px;align-items:center"><button type="button" class="orbe-edit-plan" data-edit-plan="${escapeHTML(item.id)}">Editar</button><button type="button" data-delete-plan="${escapeHTML(item.id)}">×</button></span></div><span>${escapeHTML(item.phase || "Sin fase")} · ${escapeHTML(formatCompact(item.quantity))} ${escapeHTML(item.unit)}</span><small>Depende de: ${escapeHTML(dependency)}</small></div></div>${kidMarkup}</div>`;
  };
  const roots = activities.filter(item => !item.dependencyId || !byId.has(String(item.dependencyId)));
  const markup = `<div class="dependency-tree">${roots.map(renderNode).join("")}${activities.filter(item => !visited.has(String(item.id))).map(renderNode).join("")}</div>`;
  container.innerHTML = markup;
  container.querySelectorAll("[data-delete-plan]").forEach(btn => btn.addEventListener("click", () => removePlannerActivity(btn.dataset.deletePlan)));
  container.querySelectorAll("[data-edit-plan]").forEach(btn => btn.addEventListener("click", () => window.OrbePlanner?.editActivity?.(btn.dataset.editPlan)));
}


/* =========================================================
   GANTT
========================================================= */

function setGanttView(view) {

  state.currentView =
    view;


  document
    .querySelectorAll(
      ".view-btn"
    )
    .forEach(
      button => {

        const buttonView =
          button.dataset.ganttView ||
          button.dataset.view;

        button.classList.toggle(
          "active",
          buttonView === view
        );
      }
    );


  renderGantt();
}


function renderGantt() {

  const container =
    $("ganttChart");

  if (!container) {
    return;
  }


  if (
    !state.plannedActivities.length
  ) {

    container.innerHTML =
      `
        <div
          class="visual-empty"
        >

          <span>
            02
          </span>

          <strong>
            Cronograma vacío
          </strong>

          <p>
            Las barras aparecerán aquí al agregar actividades.
          </p>

        </div>
      `;

    return;
  }


  const minDate =
    state.plannedActivities.reduce(
      (min, item) =>
        !min ||
        item.start < min
          ? item.start
          : min,
      null
    );


  const maxDate =
    state.plannedActivities.reduce(
      (max, item) =>
        !max ||
        item.end > max
          ? item.end
          : max,
      null
    );


  const totalDays =
    Math.max(
      1,
      workingDaysBetween(minDate, maxDate)
    );


  const weekly =
    state.currentView !== "dias";


  const unit =
    weekly
      ? 7
      : 1;


  const columns =
    Math.ceil(
      totalDays / unit
    );


  const width =
    Math.max(
      760,
      columns *
      (
        weekly
          ? 110
          : 50
      )
    );


  const headers =
    Array.from(
      {
        length:
          columns
      },
      (_, index) => {

        const date =
          unit === 1
            ? addWorkDays(minDate, index)
            : addWorkDays(minDate, index * 5);


        return `
          <div
            class="gantt-head-cell"
          >
            ${formatDateShort(
              date
            )}
          </div>
        `;
      }
    ).join("");


  const rows =
    state.plannedActivities
      .map(
        item => {

          const offset =
            Math.max(
              0,
              workingDaysBetween(minDate, item.start) - 1
            );


          const span =
            Math.max(
              1,
              workingDaysBetween(item.start, item.end)
            );


          const left =
            (
              offset /
              totalDays
            ) * 100;


          const barWidth =
            Math.max(
              2,
              (
                span /
                totalDays
              ) * 100
            );


          return `

            <div
              class="gantt-row"
            >

              <div
                class="gantt-label"
              >

                <strong>
                  ${escapeHTML(
                    item.name
                  )}
                </strong>

                <span>
                  ${escapeHTML(
                    formatDate(
                      item.start
                    )
                  )}
                  →
                  ${escapeHTML(
                    formatDate(
                      item.end
                    )
                  )}
                </span>

              </div>


              <div
                class="gantt-track"
              >

                <div
                  class="gantt-grid"
                  style="
                    --cols:${columns}
                  "
                ></div>


                <div
                  class="gantt-bar"
                  style="
                    left:${left}%;
                    width:${barWidth}%
                  "
                >

                  ${item.duration} d

                </div>

              </div>

            </div>
          `;
        }
      )
      .join("");


  container.innerHTML =
    `

      <div
        style="overflow:auto"
      >

        <div
          style="min-width:${width}px"
        >

          <div
            class="gantt-header"
          >

            <div
              class="gantt-label-head"
            >
              ACTIVIDAD
            </div>

            <div
              class="gantt-head-grid"
              style="--cols:${columns}"
            >
              ${headers}
            </div>

          </div>

          ${rows}

        </div>

      </div>
    `;
}


/* =========================================================
   TABLA MAESTRA
========================================================= */

function populateMasterFilters() {

  const phase =
    $("masterPhaseFilter");

  const manager =
    $("masterManagerFilter");

  const employee =
    $("masterEmployeeFilter");


  if (
    !phase ||
    !manager ||
    !employee
  ) {

    return;
  }


  const currentPhase =
    phase.value;

  const currentManager =
    manager.value;

  const currentEmployee =
    employee.value;


  const phases =
    [
      ...new Set(
        state.plannedActivities
          .map(
            item =>
              item.phase
          )
          .filter(Boolean)
      )
    ];


  const managers =
    [
      ...new Set(
        state.plannedActivities
          .map(
            item =>
              item.manager
          )
          .filter(Boolean)
      )
    ];


  phase.innerHTML =
    `<option value="">
      Todas las fases
    </option>` +
    phases
      .map(
        value =>
          `<option value="${escapeHTML(value)}">
            ${escapeHTML(value)}
          </option>`
      )
      .join("");


  manager.innerHTML =
    `<option value="">
      Todos los encargados
    </option>` +
    managers
      .map(
        value =>
          `<option value="${escapeHTML(value)}">
            ${escapeHTML(value)}
          </option>`
      )
      .join("");


  employee.innerHTML =
    `<option value="">
      Todos los empleados
    </option>` +
    state.employees
      .map(
        employee =>
          `<option value="${escapeHTML(employee.id)}">
            ${escapeHTML(employee.name)}
          </option>`
      )
      .join("");


  phase.value =
    currentPhase;

  manager.value =
    currentManager;

  employee.value =
    currentEmployee;
}


function renderMasterTable() {

  const body =
    $("masterTableBody");

  if (!body) {
    return;
  }


  populateMasterFilters();


  let rows =
    [
      ...state.plannedActivities
    ];


  const phase =
    $("masterPhaseFilter")?.value ||
    "";

  const manager =
    $("masterManagerFilter")?.value ||
    "";

  const employee =
    $("masterEmployeeFilter")?.value ||
    "";

  const period =
    $("masterPeriodFilter")?.value ||
    "";


  if (phase) {

    rows =
      rows.filter(
        item =>
          item.phase ===
          phase
      );
  }


  if (manager) {

    rows =
      rows.filter(
        item =>
          item.manager ===
          manager
      );
  }


  if (employee) {

    rows =
      rows.filter(
        item =>
          item.employees?.some(
            person =>
              String(
                person.id
              ) ===
              String(
                employee
              )
          )
      );
  }

  if (period) {
    const today = new Date();
    today.setHours(0,0,0,0);
    let from = new Date(today);
    let to = new Date(today);
    if (period === "semana") {
      const day = today.getDay() || 7;
      from.setDate(today.getDate() - day + 1);
      to = new Date(from);
      to.setDate(from.getDate() + 4);
    }
    rows = rows.filter(item => {
      const start = parseDate(item.start);
      const end = parseDate(item.end);
      return start && end && start <= to && end >= from;
    });
  }


  if (!rows.length) {

    body.innerHTML =
      `
        <tr>

          <td
            colspan="7"
            class="table-empty"
          >
            No hay actividades programadas.
          </td>

        </tr>
      `;

    return;
  }


  body.innerHTML =
    rows
      .map(
        (item, index) =>
          `

            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                ${escapeHTML(
                  item.phase ||
                  "—"
                )}
              </td>

              <td>

                <strong>
                  ${escapeHTML(
                    item.name
                  )}
                </strong>

                <br>

                <small>
                  ${escapeHTML(
                    formatCompact(
                      item.quantity
                    )
                  )}
                  ${escapeHTML(
                    item.unit
                  )}
                </small>

              </td>

              <td>
                ${escapeHTML(
                  item.manager ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHTML(
                  formatDateShort(
                    item.start
                  )
                )}
              </td>

              <td>
                ${escapeHTML(
                  formatDateShort(
                    item.end
                  )
                )}
              </td>

              <td>
                ${escapeHTML(
                  (
                    item.employees ||
                    []
                  )
                    .map(
                      employee =>
                        employee.name
                    )
                    .join(
                      ", "
                    ) ||
                  "—"
                )}
              </td>

            </tr>

          `
      )
      .join("");
}


function renderAllPlannerViews() {

  renderDependencyScheme();

  renderGantt();

  renderMasterTable();
}


/* =========================================================
   PROJECT UI
========================================================= */

function injectProjectStyles() {

  if (
    $("projectStyles")
  ) {

    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "projectStyles";


  style.textContent = `

    .project-gate{
      position:fixed;
      inset:0;
      z-index:5000;
      background:rgba(11,13,16,.76);
      backdrop-filter:blur(8px);
      display:grid;
      place-items:center;
      padding:24px;
    }

    .project-gate[hidden]{
      display:none!important;
    }

    .project-panel{
      width:min(760px,100%);
      max-height:calc(100vh - 48px);
      overflow:auto;
      background:#fff;
      border-radius:18px;
      border:1px solid #e3e6e3;
      box-shadow:0 30px 90px rgba(0,0,0,.25);
      padding:28px;
    }

    .project-kicker{
      font:700 9px "DM Mono",monospace;
      letter-spacing:.15em;
      color:#7b837d;
    }

    .project-kicker i{
      display:inline-block;
      width:18px;
      height:2px;
      background:#9cc51f;
      margin-right:7px;
      vertical-align:middle;
    }

    .project-panel h2{
      margin:10px 0 6px;
      font-size:28px;
      letter-spacing:-.04em;
    }

    .project-panel > p{
      margin:0 0 20px;
      color:#737875;
      font-size:12px;
      line-height:1.6;
    }

    .project-home-actions{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
    }

    .project-choice{
      text-align:left;
      padding:20px;
      border:1px solid #dfe3df;
      border-radius:12px;
      background:#fff;
      cursor:pointer;
    }

    .project-choice:hover{
      border-color:#b8ca83;
      background:#fbfdf7;
    }

    .project-choice strong{
      display:block;
      font-size:13px;
      margin-bottom:5px;
    }

    .project-choice span{
      font-size:10px;
      color:#858c87;
      line-height:1.5;
    }

    .project-form-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:13px;
    }

    .project-field{
      display:grid;
      gap:7px;
    }

    .project-field.wide{
      grid-column:1/-1;
    }

    .project-field label{
      font-size:9px;
      font-weight:800;
      text-transform:uppercase;
      color:#6e756f;
    }

    .project-field input,
    .project-field select{
      height:42px;
      border:1px solid #dfe3df;
      border-radius:8px;
      padding:0 11px;
      font-size:11px;
    }

    .project-actions{
      display:flex;
      justify-content:space-between;
      gap:10px;
      margin-top:20px;
      padding-top:16px;
      border-top:1px solid #eef0ee;
    }

    .project-list{
      display:grid;
      gap:9px;
    }

    .project-list-empty{
      padding:30px;
      border:1px dashed #dfe4df;
      border-radius:10px;
      text-align:center;
      color:#8d948f;
      font-size:11px;
    }

    .saved-project{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:13px;
      border:1px solid #e3e6e3;
      border-radius:10px;
      background:#fafbfa;
    }

    .saved-project-info{
      display:grid;
      gap:4px;
    }

    .saved-project-info strong{
      font-size:11px;
    }

    .saved-project-info span{
      font-size:9px;
      color:#858c87;
    }

    .saved-project-actions{
      display:flex;
      gap:6px;
    }

    .saved-project-actions button{
      height:32px;
      border:1px solid #dfe3df;
      border-radius:7px;
      background:#fff;
      padding:0 10px;
      font-size:9px;
      font-weight:800;
      cursor:pointer;
    }

    .saved-project-actions .delete{
      color:#a44848;
    }

    .project-current-bar{
      margin:-18px 0 18px;
    }

    .project-current-pill{
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:6px 9px;
      border:1px solid #dfe3df;
      border-radius:7px;
      background:#fff;
      font:700 9px "DM Mono",monospace;
      color:#616963;
    }

    .project-current-pill i{
      width:6px;
      height:6px;
      border-radius:50%;
      background:#9cc51f;
    }

    .employee-selector-toolbar{
      display:flex;
      align-items:center;
      gap:7px;
      padding:4px 2px 8px;
      color:#7b837d;
      font-size:9px;
    }

    .employee-selector-toolbar span{
      margin-right:auto;
    }

    .employee-selector-toolbar button{
      border:0;
      background:transparent;
      color:#66705a;
      font-size:9px;
      font-weight:800;
      cursor:pointer;
    }

    .employee-list{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
      gap:6px;
    }

    .employee-option{
      display:flex;
      align-items:center;
      gap:8px;
      padding:8px;
      border:1px solid #e1e5e1;
      border-radius:8px;
      background:#fff;
      cursor:pointer;
    }

    .employee-option:has(input:checked){
      border-color:#bdcf84;
      background:#f6f9ed;
    }

    .employee-option input{
      accent-color:#9cc51f;
    }

    .employee-option span{
      display:grid;
      gap:2px;
    }

    .employee-option strong{
      font-size:9px;
    }

    .employee-option small{
      font-size:8px;
      color:#858c87;
    }

    .dependency-node{
      display:flex;
      gap:10px;
      padding:10px 0;
      border-bottom:1px solid #eef0ee;
    }

    .dependency-number{
      width:28px;
      height:28px;
      flex:0 0 28px;
      border-radius:8px;
      background:#f2f5ed;
      display:grid;
      place-items:center;
      font:700 9px "DM Mono";
      color:#708033;
    }

    .dependency-body{
      flex:1;
      min-width:0;
    }

    .dependency-top{
      display:flex;
      gap:10px;
      align-items:center;
    }

    .dependency-top strong{
      font-size:11px;
      flex:1;
    }

    .dependency-top button{
      border:0;
      background:transparent;
      color:#a44;
      font-size:16px;
      cursor:pointer;
    }

    .dependency-body>span,
    .dependency-body small{
      display:block;
      font-size:9px;
      color:#818982;
      margin-top:3px;
    }

    .gantt-header,
    .gantt-row{
      display:grid;
      grid-template-columns:230px 1fr;
      min-width:760px;
    }

    .gantt-label-head{
      padding:9px;
      font:700 8px "DM Mono";
      color:#7a817b;
      border-bottom:1px solid #e8ebe8;
    }

    .gantt-head-grid{
      display:grid;
      grid-template-columns:repeat(var(--cols),1fr);
      border-bottom:1px solid #e8ebe8;
    }

    .gantt-head-cell{
      padding:9px 5px;
      text-align:center;
      font:700 8px "DM Mono";
      color:#858c87;
      border-left:1px solid #f0f2f0;
    }

    .gantt-label{
      padding:9px;
      border-bottom:1px solid #eef0ee;
      display:grid;
      gap:3px;
    }

    .gantt-label strong{
      font-size:9px;
    }

    .gantt-label span{
      font-size:8px;
      color:#8a918c;
    }

    .gantt-track{
      position:relative;
      min-height:45px;
      border-bottom:1px solid #eef0ee;
    }

    .gantt-grid{
      position:absolute;
      inset:0;
      background-image:
        linear-gradient(
          to right,
          #eef0ee 1px,
          transparent 1px
        );
      background-size:
        calc(
          100% /
          var(--cols)
        ) 100%;
    }

    .gantt-bar{
      position:absolute;
      top:9px;
      height:27px;
      min-width:42px;
      border-radius:6px;
      background:#dff09a;
      color:#445311;
      font-size:8px;
      font-weight:800;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:0 7px;
      white-space:nowrap;
      overflow:hidden;
    }

    @media(max-width:700px){

      .project-home-actions,
      .project-form-grid{
        grid-template-columns:1fr;
      }

      .project-field.wide{
        grid-column:auto;
      }

      .saved-project{
        align-items:flex-start;
        flex-direction:column;
      }

      .saved-project-actions{
        width:100%;
      }

      .saved-project-actions button{
        flex:1;
      }
    }

  `;


  document.head.appendChild(
    style
  );
}

let projectGateBound = false;

function skipProjectForNow() {
  state.currentProject = null;
  state.plannedActivities = [];
  state.selectedEmployees = [];
  state.editingPlanId = "";
  closeProjectGate();
  showView("planificador");
  try {
    populateDependencies();
    renderAllPlannerViews();
  } catch (error) {
    console.warn("No se pudo refrescar el planificador en modo libre:", error);
  }
}

function bindProjectGateEvents() {
  if (projectGateBound) return;
  projectGateBound = true;

  $("newProjectBtn")?.addEventListener("click", () => showProjectSection("form"));
  $("continueProjectBtn")?.addEventListener("click", () => showProjectSection("list"));
  $("backProjectHome")?.addEventListener("click", () => showProjectSection("home"));
  $("backProjectList")?.addEventListener("click", () => showProjectSection("home"));
  $("createProjectBtn")?.addEventListener("click", createProject);
  $("skipProjectBtn")?.addEventListener("click", skipProjectForNow);
}

function mountProjectGate() {

  if ($("projectGate")) {
    bindProjectGateEvents();
    return;
  }

  injectProjectStyles();


  const overlay =
    document.createElement(
      "div"
    );


  overlay.id =
    "projectGate";

  overlay.className =
    "project-gate";

  overlay.hidden =
    true;


  overlay.innerHTML =
    `

      <div
        class="project-panel"
      >

        <div id="projectHome">

          <div class="project-kicker">
            <i></i>
            PLANIFICADOR DE OBRA
          </div>

          <h2>
            ¿Qué proyecto vas a planificar?
          </h2>

          <p>
            Crea un proyecto nuevo o continúa
            uno guardado en Google Sheets.
          </p>


          <div
            class="project-home-actions"
          >

            <button
              id="newProjectBtn"
              class="project-choice"
              type="button"
            >

              <strong>
                ＋ Nuevo proyecto
              </strong>

              <span>
                Crear un proyecto,
                definir sus fechas
                y empezar a programar.
              </span>

            </button>


            <button
              id="continueProjectBtn"
              class="project-choice"
              type="button"
            >

              <strong>
                ↪ Continuar proyecto
              </strong>

              <span>
                Abrir un proyecto existente
                y continuar su cronograma.
              </span>

            </button>

          </div>

          <button
            id="skipProjectBtn"
            class="project-skip"
            type="button"
          >
            Omitir por ahora →
          </button>

        </div>


        <div
          id="projectForm"
          hidden
        >

          <div class="project-kicker">
            <i></i>
            NUEVO PROYECTO
          </div>

          <h2>
            Crear proyecto
          </h2>

          <p>
            Los datos quedarán guardados
            permanentemente en Google Sheets.
          </p>


          <div
            class="project-form-grid"
          >

            <div
              class="project-field wide"
            >

              <label>
                Nombre del proyecto
              </label>

              <input
                id="projectName"
                placeholder="Ej. Grupo Q · Santa Elena"
              >

            </div>


            <div class="project-field">

              <label>
                Ubicación
              </label>

              <input
                id="projectLocation"
                placeholder="Ej. Santa Elena, San Salvador"
              >

            </div>


            <div class="project-field">

              <label>
                Tipo
              </label>

              <select
                id="projectType"
              >

                <option value="Construcción">
                  Construcción
                </option>

                <option value="Remodelación">
                  Remodelación
                </option>

                <option value="Adecuación">
                  Adecuación
                </option>

                <option value="Mantenimiento">
                  Mantenimiento
                </option>

              </select>

            </div>


            <div class="project-field">

              <label>
                Inicio
              </label>

              <input
                id="projectStart"
                type="date"
                value="${CONFIG.projectStart}"
              >

            </div>


            <div class="project-field">

              <label>
                Fin
              </label>

              <input
                id="projectEnd"
                type="date"
              >

            </div>

          </div>


          <div
            class="project-actions"
          >

            <button
              id="backProjectHome"
              class="outline-btn"
              type="button"
            >
              ← Volver
            </button>

            <button
              id="createProjectBtn"
              class="dark-btn"
              type="button"
            >
              Crear proyecto
            </button>

          </div>

        </div>


        <div
          id="projectList"
          hidden
        >

          <div class="project-kicker">
            <i></i>
            PROYECTOS GUARDADOS
          </div>

          <h2>
            Continuar proyecto
          </h2>

          <p>
            Selecciona el proyecto con el que
            quieres trabajar.
          </p>


          <div
            id="savedProjects"
            class="project-list"
          ></div>


          <div
            class="project-actions"
          >

            <button
              id="backProjectList"
              class="outline-btn"
              type="button"
            >
              ← Volver
            </button>

          </div>

        </div>

      </div>
    `;


  document.body.appendChild(
    overlay
  );


  $("newProjectBtn")
    .addEventListener(
      "click",
      () =>
        showProjectSection(
          "form"
        )
    );


  $("continueProjectBtn")
    .addEventListener(
      "click",
      () =>
        showProjectSection(
          "list"
        )
    );


  $("backProjectHome")
    .addEventListener(
      "click",
      () =>
        showProjectSection(
          "home"
        )
    );


  $("backProjectList")
    .addEventListener(
      "click",
      () =>
        showProjectSection(
          "home"
        )
    );


  $("createProjectBtn")
    .addEventListener(
      "click",
      createProject
    );
}


function showProjectSection(
  section
) {

  $("projectHome").hidden =
    section !== "home";

  $("projectForm").hidden =
    section !== "form";

  $("projectList").hidden =
    section !== "list";


  if (
    section === "list"
  ) {

    renderProjectList();
  }
}


function openProjectGate() {

  mountProjectGate();

  $("projectGate").hidden =
    false;

  showProjectSection(
    "home"
  );
}


function closeProjectGate() {

  if (
    $("projectGate")
  ) {

    $("projectGate").hidden =
      true;
  }
}


/* =========================================================
   PROYECTOS
========================================================= */

function renderProjectList() {

  const box =
    $("savedProjects");

  if (!box) {
    return;
  }


  if (
    !state.projects.length
  ) {

    box.innerHTML =
      `
        <div
          class="project-list-empty"
        >
          Todavía no hay proyectos guardados.
        </div>
      `;

    return;
  }


  box.innerHTML =
    state.projects
      .map(
        project =>
          `

            <div
              class="saved-project"
            >

              <div
                class="saved-project-info"
              >

                <strong>
                  ${escapeHTML(
                    project.name
                  )}
                </strong>

                <span>
                  ${escapeHTML(
                    project.location ||
                    "Sin ubicación"
                  )}

                  ·

                  ${formatDate(
                    project.start
                  )}

                  ${
                    project.end
                      ? " → " +
                        formatDate(
                          project.end
                        )
                      : ""
                  }
                </span>

              </div>


              <div
                class="saved-project-actions"
              >

                <button
                  type="button"
                  data-open-project="${escapeHTML(
                    project.id
                  )}"
                >
                  Abrir
                </button>


                <button
                  type="button"
                  class="delete"
                  data-delete-project="${escapeHTML(
                    project.id
                  )}"
                >
                  Eliminar
                </button>

              </div>

            </div>

          `
      )
      .join("");


  box
    .querySelectorAll(
      "[data-open-project]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const project =
              state.projects.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    button.dataset
                      .openProject
                  )
              );


if (project) {
  enterProject(project);
}
          }
        );
      }
    );


  box
    .querySelectorAll(
      "[data-delete-project]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            const project =
              state.projects.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    button.dataset
                      .deleteProject
                  )
              );


            if (!project) {
              return;
            }


            const confirmed =
              confirm(
                `¿Eliminar el proyecto "${project.name}" y todas sus actividades?`
              );


            if (!confirmed) {
              return;
            }


            try {

              await api(
                "deleteProject",
                null,
                project.id
              );


              state.projects =
                state.projects.filter(
                  item =>
                    String(
                      item.id
                    ) !==
                    String(
                      project.id
                    )
                );


              state.allPlans =
                state.allPlans.filter(
                  item =>
                    String(
                      item.projectId
                    ) !==
                    String(
                      project.id
                    )
                );


              if (
                state.currentProject &&
                String(
                  state.currentProject.id
                ) ===
                String(
                  project.id
                )
              ) {

                state.currentProject =
                  null;

                state.plannedActivities =
                  [];

                renderAllPlannerViews();
              }


              renderProjectList();

            } catch (error) {

              alert(
                "No se pudo eliminar el proyecto:\n\n" +
                error.message
              );
            }

          }
        );
      }
    );
}


async function createProject() {

  const name =
    $("projectName")
      ?.value
      .trim() ||
    "";


  const location =
    $("projectLocation")
      ?.value
      .trim() ||
    "";


  const type =
    $("projectType")
      ?.value ||
    "Construcción";


  const start =
    $("projectStart")
      ?.value ||
    CONFIG.projectStart;


  const end =
    $("projectEnd")
      ?.value ||
    "";


  if (!name) {

    alert(
      "Escribe el nombre del proyecto."
    );

    return;
  }


  if (
    end &&
    end < start
  ) {

    alert(
      "La fecha de fin no puede ser anterior al inicio."
    );

    return;
  }


  const button =
    $("createProjectBtn");


  button.disabled =
    true;

  button.textContent =
    "Guardando…";


  try {

    const data = {

      ID_PROYECTO:
        "",

      NOMBRE:
        name,

      UBICACION:
        location,

      TIPO:
        type,

      INICIO:
        start,

      FIN:
        end,

      ESTADO:
        "Activo"
    };


    const result =
      await api(
        "saveProject",
        data
      );


    const project =
      normalizeProject({
        ...data,

        ID_PROYECTO:
          result.id
      });


    state.projects.push(
      project
    );


const drafts =
  state._pendingDrafts || [];

const shouldSave =
  !!state._pendingSavePlanning;

state._pendingSavePlanning = false;
state._pendingDrafts = [];

enterProject(project);

if (shouldSave && drafts.length) {

  state.plannedActivities =
    drafts.map(plan => ({
      ...plan,
      projectId: project.id
    }));

  await savePlannerPlanning();
}
  } catch (error) {

    alert(
      "No se pudo crear el proyecto:\n\n" +
      error.message
    );

  } finally {

    button.disabled =
      false;

    button.textContent =
      "Crear proyecto";
  }
}


function enterProject(
  project
) {

  state.currentProject =
    project;


  CONFIG.projectStart =
    formatISODate(
      project.start
    ) ||
    CONFIG.projectStart;


  closeProjectGate();

  updateCurrentProjectUI();

  loadCurrentProjectPlans();
}


function updateCurrentProjectUI() {

  const project =
    state.currentProject;

  if (!project) {
    return;
  }


  document
    .querySelectorAll(
      ".project-mini"
    )
    .forEach(
      element => {

        element.innerHTML = `

          <span class="mini-label">
            PROYECTO ACTUAL
          </span>

          <strong>
            ${escapeHTML(
              project.name
            )}
          </strong>

          <span>
            ${escapeHTML(
              project.location ||
              "Sin ubicación"
            )}

            · Inicio

            ${formatDate(
              project.start
            )}
          </span>
        `;
      }
    );


  const heroDate = document.querySelector(".hero-date");
  if (heroDate) {
    const start = parseDate(project.start);
    const end = parseDate(project.end);
    const durationMonths = start && end
      ? ((end.getFullYear()-start.getFullYear())*12 + (end.getMonth()-start.getMonth()) + (end.getDate() >= start.getDate() ? 0 : -1))
      : 0;
    heroDate.innerHTML = `
      <span>PLAZO DEL PROYECTO</span>
      <strong>${end && durationMonths > 0 ? durationMonths : (end ? daysBetween(start,end) : "—")} <small>${end && durationMonths > 0 ? "MESES" : (end ? "DÍAS" : "")}</small></strong>
      <em>${formatDate(project.start)}${end ? " → " + formatDate(project.end) : ""}</em>
    `;
  }

  let bar =
    $("projectCurrentBar");


  if (!bar) {

    const hero =
      document.querySelector(
        ".hero"
      );


    if (hero) {

      bar =
        document.createElement(
          "div"
        );

      bar.id =
        "projectCurrentBar";

      bar.className =
        "project-current-bar";


      hero.parentNode.insertBefore(
        bar,
        hero
      );
    }
  }


  if (bar) {

    bar.innerHTML = `

      <span
        class="project-current-pill"
      >

        <i></i>

        ${escapeHTML(
          project.name
        )}

        ·

        ${escapeHTML(
          project.location ||
          "Sin ubicación"
        )}

      </span>
    `;
  }
}


function loadCurrentProjectPlans() {

  if (
    !state.currentProject
  ) {

    return;
  }


  const projectId =
    String(
      state.currentProject.id
    );


  const source =
    state.allPlans.filter(
      item =>
        String(
          item.projectId
        ) ===
        projectId
    );


  state.plannedActivities =
    source.map(
      item => ({

        id:
          item.id,

        sheetId:
          item.id,

        projectId:
          item.projectId,

        activityId:
          item.activityId,

        phase:
          item.phase,

        subarea:
  state.activities.find(
    activity =>
      String(activity.id) ===
      String(item.activityId)
  )?.subarea ||
  "",

        name:
          item.name,

        quantity:
          item.quantity,

        unit:
          item.unit,

        manager:
          item.manager || "",

        start:
          item.start,

        end:
          item.end,

        duration:
          item.duration,

        dependencyId:
          item.dependencyId ||
          null,

      dependencyName:
  source.find(
    dependency =>
      String(dependency.id) ===
      String(item.dependencyId)
  )?.name ||
  "",

        employees:
          item.employees
            .map(
              id =>
                state.employees.find(
                  employee =>
                    String(
                      employee.id
                    ) ===
                    String(id)
                ) ||
                {
                  id,

                  name:
                    id,

                  trade:
                    "",

                  role:
                    ""
                }
            ),

        yield:
          item.yield,

        yieldUnit:
          item.yieldUnit,

        shift:
          item.shift,

        status:
          item.status

      })
    );


  state.nextId =
    state.plannedActivities.length +
    1;


  populateDependencies();

  renderAllPlannerViews();
}


/* =========================================================
   CAMBIAR PROYECTO
========================================================= */

function addProjectButton() {

  if (
    $("changeProjectButton")
  ) {

    return;
  }


  const host =
    document.querySelector(
      ".topbar-right"
    );


  if (!host) {
    return;
  }


  const button =
    document.createElement(
      "button"
    );


  button.id =
    "changeProjectButton";

  button.type =
    "button";

  button.className =
    "outline-btn";

  button.textContent =
    "Cambiar proyecto";


  button.addEventListener(
    "click",
    openProjectGate
  );


  host.insertBefore(
    button,
    host.firstChild
  );
}

/* =========================================================
   MENÚ MÓVIL
========================================================= */

function openMobileMenu(){

  const sidebar =
    document.querySelector(
      ".sidebar"
    );

  const backdrop =
    $("mobileMenuBackdrop");

  const button =
    $("mobileMenuBtn");

  sidebar?.classList.add(
    "mobile-open"
  );

  backdrop?.classList.add(
    "open"
  );

  document.body.classList.add(
    "mobile-menu-open"
  );

  button?.setAttribute(
    "aria-expanded",
    "true"
  );
}


function closeMobileMenu(){

  const sidebar =
    document.querySelector(
      ".sidebar"
    );

  const backdrop =
    $("mobileMenuBackdrop");

  const button =
    $("mobileMenuBtn");

  sidebar?.classList.remove(
    "mobile-open"
  );

  backdrop?.classList.remove(
    "open"
  );

  document.body.classList.remove(
    "mobile-menu-open"
  );

  button?.setAttribute(
    "aria-expanded",
    "false"
  );
}


function toggleMobileMenu(){

  const sidebar =
    document.querySelector(
      ".sidebar"
    );

  if(
    sidebar?.classList.contains(
      "mobile-open"
    )
  ){

    closeMobileMenu();

  }else{

    openMobileMenu();

  }
}

/* =========================================================
   NAVEGACIÓN
========================================================= */

function showView(
  viewName
) {

  document
    .querySelectorAll(
      ".app-view"
    )
    .forEach(
      view => {

        view.hidden =
          view.id !==
          `view-${viewName}`;
      }
    );


  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.view ===
          viewName
        );
      }
    );
}


/* =========================================================
   EXPORTAR / IMPRIMIR
========================================================= */

function exportCSV() {

  const rows = [

    [
      "#",
      "Fase",
      "Actividad",
      "Encargado",
      "Inicio",
      "Fin",
      "Equipo"
    ]

  ];


  state.plannedActivities.forEach(
    (item, index) => {

      rows.push([

        index + 1,

        item.phase || "",

        item.name || "",

        item.manager || "",

        formatISODate(
          item.start
        ),

        formatISODate(
          item.end
        ),

        (
          item.employees ||
          []
        )
          .map(
            employee =>
              employee.name
          )
          .join(
            " | "
          )

      ]);
    }
  );


  const csv =
    rows
      .map(
        row =>
          row
            .map(
              cell =>
                `"${String(
                  cell ??
                  ""
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
      )
      .join(
        "\r\n"
      );


  const blob =
    new Blob(
      [
        "\ufeff" +
        csv
      ],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;

  link.download =
    `${(
      state.currentProject?.name ||
      "planificador"
    ).replace(
      /[^a-z0-9]+/gi,
      "_"
    )}.csv`;


  link.click();


  URL.revokeObjectURL(
    url
  );
}


function printPlanner() {
  document.body.classList.add("print-master-only");
  const cleanup = () => document.body.classList.remove("print-master-only");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 1500);
}


/* =========================================================
   EVENTOS
========================================================= */

function bindEvents() {

  $("plannerActivity")
    ?.addEventListener(
      "change",
      onActivitySelected
    );


  $("plannerDuration")
    ?.addEventListener(
      "input",
      calculatePlannerRequirement
    );


  $("plannerDurationUnit")
    ?.addEventListener(
      "change",
      calculatePlannerRequirement
    );

const saveButton = $("savePlannerPlanning");

if (saveButton) {
  saveButton.addEventListener(
    "click",
    savePlannerPlanning
  );
}
  $("clearPlannerActivity")
    ?.addEventListener(
      "click",
      () =>
        clearActivityForm(
          true
        )
    );
 
  document
    .querySelectorAll(
      ".view-btn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            setGanttView(
              button.dataset
                .ganttView ||
              button.dataset
                .view ||
              "semanas"
            )
        );
      }
    );


  document
  .querySelectorAll(
    ".nav-item"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          showView(
            button.dataset.view
          );

          closeMobileMenu();

        }
      );

    }
  );


$("mobileMenuBtn")
  ?.addEventListener(
    "click",
    toggleMobileMenu
  );


$("mobileMenuBackdrop")
  ?.addEventListener(
    "click",
    closeMobileMenu
  );


  [
    "masterPhaseFilter",
    "masterManagerFilter",
    "masterEmployeeFilter",
    "masterPeriodFilter"
  ]
    .forEach(
      id => {

        $(id)
          ?.addEventListener(
            "change",
            renderMasterTable
          );
      }
    );


  $("filterMasterTable")
    ?.addEventListener(
      "click",
      renderMasterTable
    );


  $("exportMasterTable")
    ?.addEventListener(
      "click",
      exportCSV
    );


  $("printMasterTable")
    ?.addEventListener(
      "click",
      printPlanner
    );
}


/* =========================================================
   INICIALIZACIÓN
========================================================= */

async function initialize() {

  console.log(
    "ORBE C Films — Planificador V3 iniciando..."
  );


  mountProjectGate();

  injectShiftControl();

  addProjectButton();

  bindEvents();

  showView(
    "planificador"
  );


  renderActivityInfo();

  renderEmployeeSelector();

  renderDependencyScheme();

  renderGantt();

  renderMasterTable();


  await loadSheets();


  renderProjectList();


  /*
   * Abrimos la pantalla de proyectos
   * porque no estamos usando localStorage
   * como fuente permanente.
   */

  if (
    state.currentProject
  ) {

    loadCurrentProjectPlans();

  } else {

    openProjectGate();
  }
}


/* =========================================================
   ARRANQUE
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initialize
  );

} else {

  initialize();
}
/* =========================================================
   ORBE C FILMS — PLANIFICADOR DE OBRA
   V4 FINAL PATCH
   Integra: calculadora ESCENARIOS, edición de actividades,
   ruta crítica/holguras, disponibilidad entre proyectos,
   exportación Excel cuando SheetJS está disponible y mejoras
   de turnos/planificación sin cambiar Google Sheets.
========================================================= */

(function(){
"use strict";

/* ---------- helpers ---------- */
const ORBE = {
  editId: null,
  scenarioMode: "individual",
  scenarioBound: false,
  presets: JSON.parse(localStorage.getItem("obra_presets") || "[]")
};

function orbeEl(id){ return document.getElementById(id); }
function orbeNum(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
function orbeFmt(v,d=2){ return Number(v||0).toLocaleString("es-SV",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function orbeEscape(v=""){ return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

/* =========================================================
   ESCENARIOS — CALCULADORA DEFINITIVA
   Fórmulas originales conservadas:
   producción diaria = rendimiento × recursos × eficiencia
   días = cantidad / producción diaria
   recursos = cantidad / (rendimiento × días × eficiencia)
   rendimiento requerido = cantidad / (recursos × días × eficiencia)
========================================================= */
function scenarioNum(id, fallback=0){
  const el = orbeEl(id);
  if(!el) return fallback;
  const n = Number(String(el.value ?? "").replace(/,/g,"."));
  return Number.isFinite(n) ? n : fallback;
}

function scenarioUnit(){
  return (orbeEl("unit")?.value || "unidad").trim() || "unidad";
}

function scenarioResourceWord(){
  return ORBE.scenarioMode === "individual" ? "personas" : "equipos";
}

function scenarioResourceSingular(){
  return ORBE.scenarioMode === "individual" ? "persona" : "equipo";
}

function scenarioFmt(value, decimals=2){
  return Number(value || 0).toLocaleString("es-SV", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function scenarioFindYield(activity){
  if(!activity) return null;
  const name = normalize(activity.name);
  const exact = state.yields.find(y => normalize(y.activity) === name);
  if(exact && exact.yield > 0) return exact;
  const related = state.yields.find(y => {
    const yName = normalize(y.activity);
    return yName && (name.includes(yName) || yName.includes(name));
  });
  return related && related.yield > 0 ? related : null;
}

function populateScenarioActivities(){
  const select = orbeEl("activitySelect");
  if(!select) return;

  const previous = select.value;
  select.innerHTML = `<option value="">Sin actividad — prueba libre</option>`;

  (state.activities || []).forEach((item,index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${item.id || ""} — ${item.name || ""}` +
      `${item.quantity != null ? ` · ${formatCompact(item.quantity)} ${item.unit || ""}` : ""}`;
    select.appendChild(option);
  });

  if(previous && [...select.options].some(o => o.value === previous)){
    select.value = previous;
  }

  const count = orbeEl("navCount");
  if(count) count.textContent = String((state.activities || []).length);

  const status = orbeEl("sheetStatusText");
  if(status && state.connected){
    status.textContent = `${(state.activities || []).length} actividades · ${(state.yields || []).length} rendimientos.`;
  }
}

function setScenarioMode(mode){
  ORBE.scenarioMode = mode;
  orbeEl("individualBtn")?.classList.toggle("selected", mode === "individual");
  orbeEl("teamBtn")?.classList.toggle("selected", mode === "team");
  const peopleWrap = orbeEl("peoplePerTeamWrap");
  if(peopleWrap) peopleWrap.hidden = mode !== "team";
  const unit = scenarioUnit();
  const suffix = orbeEl("yieldSuffix");
  if(suffix) suffix.textContent = `${unit} / persona / día`;
  const label1 = orbeEl("resourceLabel");
  if(label1) label1.textContent = scenarioResourceWord();
  const label2 = orbeEl("resourceLabel2");
  if(label2) label2.textContent = scenarioResourceWord();
  calculateOrbeScenario();
}

function loadScenarioActivity(){
  const value = orbeEl("activitySelect")?.value || "";
  const info = orbeEl("activityInfo");
  if(value === ""){
    if(info) info.textContent = "Selecciona una partida para cargar automáticamente su cantidad y unidad.";
    calculateOrbeScenario();
    return;
  }

  const activity = state.activities[Number(value)];
  if(!activity) return;

  if(orbeEl("quantity")) orbeEl("quantity").value = activity.quantity ?? "";
  if(orbeEl("unit")) orbeEl("unit").value = activity.unit || "";

  const recommendation = scenarioFindYield(activity);
  if(recommendation){
    if(orbeEl("yield")) orbeEl("yield").value = recommendation.yield;
    if(info){
      info.textContent = `Partida ${activity.id || "—"} · ${activity.name || ""} · Rendimiento del Sheet: ${scenarioFmt(recommendation.yield)} ${activity.unit || recommendation.unit || "unidad"}/persona/día · editable`;
    }
  }else{
    if(orbeEl("yield")) orbeEl("yield").value = "";
    if(info){
      info.textContent = `Partida ${activity.id || "—"} · ${activity.name || ""} · Sin rendimiento registrado en RENDIMIENTOS. Ingresa uno manualmente.`;
    }
  }

  const suffix = orbeEl("yieldSuffix");
  if(suffix) suffix.textContent = `${scenarioUnit()} / persona / día`;
  calculateOrbeScenario();
}

function renderScenarioPresets(){
  const box = orbeEl("presetList");
  if(!box) return;
  if(!ORBE.presets.length){
    box.innerHTML = `<span class="muted">Todavía no hay rendimientos guardados. Guarda uno cuando encuentres un dato que quieras reutilizar.</span>`;
    return;
  }
  box.innerHTML = ORBE.presets.map((preset,index)=>`
    <div class="preset">
      <span><b>${orbeEscape(preset.name)}</b> · ${scenarioFmt(preset.yield)} ${orbeEscape(preset.unit)}/persona/día</span>
      <button type="button" data-scenario-preset="${index}">Usar</button>
    </div>
  `).join("");
  box.querySelectorAll("[data-scenario-preset]").forEach(button=>{
    button.addEventListener("click",()=>{
      const preset = ORBE.presets[Number(button.dataset.scenarioPreset)];
      if(!preset) return;
      if(orbeEl("yield")) orbeEl("yield").value = preset.yield;
      if(orbeEl("unit")) orbeEl("unit").value = preset.unit;
      setScenarioMode(preset.mode || "individual");
    });
  });
}

function saveScenarioPreset(){
  const selected = orbeEl("activitySelect")?.selectedOptions?.[0];
  const defaultName = selected && selected.value !== "" ? selected.textContent.split("—").slice(1).join("—").trim() : "Rendimiento personalizado";
  const name = prompt("Nombre para este rendimiento:", defaultName);
  if(!name) return;
  ORBE.presets.push({name, yield: scenarioNum("yield"), unit: scenarioUnit(), mode: ORBE.scenarioMode});
  localStorage.setItem("obra_presets", JSON.stringify(ORBE.presets));
  renderScenarioPresets();
}

function calculateOrbeScenario(){
  const Q = scenarioNum("quantity");
  const R = scenarioNum("yield");
  const E = Math.max(0.01, scenarioNum("efficiency",100)) / 100;
  const targetDays = Math.max(0.01, scenarioNum("targetDays",1));
  const resources = Math.max(1, scenarioNum("resources",1));
  const targetResources = Math.max(1, scenarioNum("resourcesTarget",1));
  const peoplePerTeam = Math.max(1, scenarioNum("peoplePerTeam",2));
  const unit = scenarioUnit();
  const team = ORBE.scenarioMode === "team";
  const activePeople = team ? resources * peoplePerTeam : resources;
  const targetPeople = team ? targetResources * peoplePerTeam : targetResources;
  const resourceWord = team ? "equipos" : "personas";
  const resourceSingular = team ? "equipo" : "persona";

  const set = (id,value) => { const el = orbeEl(id); if(el) el.textContent = value; };

  if(Q <= 0 || R <= 0){
    set("requiredResources","—");
    set("requiredDetail","Ingresa cantidad y rendimiento.");
    set("calculatedDays","—");
    set("productionDetail","Producción: —");
    set("requiredYield","—");
    set("requiredYieldDetail","Ingresa cantidad, plazo y recursos.");
    if(orbeEl("scenarioTable")) orbeEl("scenarioTable").innerHTML = "";
    return;
  }

  const dailyProduction = R * activePeople * E;
  const days = Q / dailyProduction;
  const rawRequiredPeople = Q / (R * targetDays * E);
  const requiredPeople = Math.max(1, Math.ceil(rawRequiredPeople));
  const requiredUnits = team ? Math.max(1, Math.ceil(requiredPeople / peoplePerTeam)) : requiredPeople;
  const requiredYield = Q / (targetPeople * targetDays * E);

  if(team){
    set("requiredResources", `${requiredUnits} equipos · ${requiredUnits * peoplePerTeam} pers.`);
    set("requiredDetail", `${scenarioFmt(rawRequiredPeople)} personas calculadas → ${requiredUnits} equipos de ${peoplePerTeam} personas`);
  }else{
    set("requiredResources", `${requiredPeople} personas`);
    set("requiredDetail", `${scenarioFmt(rawRequiredPeople)} personas → redondeado a ${requiredPeople}`);
  }

  set("calculatedDays", `${scenarioFmt(days)} días`);
  set("productionDetail", `Producción: ${scenarioFmt(dailyProduction)} ${unit}/día` + (team ? ` · ${activePeople} personas` : ""));
  set("requiredYield", `${scenarioFmt(requiredYield)} ${unit}/persona/día`);
  set("requiredYieldDetail", `Para cumplir ${scenarioFmt(targetDays)} días con ${team ? `${targetResources} equipos` : `${targetResources} personas`}.`);

  const tbody = orbeEl("scenarioTable");
  if(!tbody) return;
  const start = Math.max(1, Math.floor(resources) - 2);
  const end = Math.floor(resources) + 2;
  const rows = [];
  for(let r=start;r<=end;r++){
    const people = team ? r * peoplePerTeam : r;
    const production = R * people * E;
    const duration = Q / production;
    const difference = targetDays ? ((duration-targetDays)/targetDays)*100 : 0;
    const resourceText = team ? `${r} equipos · ${people} pers.` : `${r} personas`;
    rows.push(`<tr class="${r === Math.floor(resources) ? "active" : ""}">\n      <td><b>${resourceText}</b></td>\n      <td>${scenarioFmt(production)} ${orbeEscape(unit)}/día</td>\n      <td><b>${scenarioFmt(duration)} días</b></td>\n      <td class="${duration <= targetDays ? "good" : "warn"}">${duration <= targetDays ? "✓ Cumple" : `+${scenarioFmt(difference)}%`}</td>\n    </tr>`);
  }
  tbody.innerHTML = rows.join("");
}

function mountScenarioCalculator(){
  const select = orbeEl("activitySelect");
  if(!select) return;

  if(!ORBE.scenarioBound){
    ORBE.scenarioBound = true;
    orbeEl("individualBtn")?.addEventListener("click",()=>setScenarioMode("individual"));
    orbeEl("teamBtn")?.addEventListener("click",()=>setScenarioMode("team"));
    select.addEventListener("change",loadScenarioActivity);
    orbeEl("clearActivity")?.addEventListener("click",()=>{select.value="";loadScenarioActivity();});
    orbeEl("savePreset")?.addEventListener("click",saveScenarioPreset);
    ["quantity","unit","yield","efficiency","targetDays","resources","resourcesTarget","peoplePerTeam"].forEach(id=>{
      orbeEl(id)?.addEventListener("input",()=>{
        if(id === "unit" && orbeEl("yieldSuffix")) orbeEl("yieldSuffix").textContent = `${scenarioUnit()} / persona / día`;
        calculateOrbeScenario();
      });
    });
  }

  populateScenarioActivities();
  renderScenarioPresets();
  setScenarioMode(ORBE.scenarioMode || "individual");
}

/* =========================================================
   ACTIVIDADES — EDICIÓN
========================================================= */
function beginEditPlannerActivity(id){
  const item=state.plannedActivities.find(x=>String(x.id)===String(id));
  if(!item)return;
  ORBE.editId=item.id;
  state.editingPlanId = item.id;
  const activityIndex=state.activities.findIndex(x=>String(x.id)===String(item.activityId));
  if(orbeEl("plannerActivity") && activityIndex>=0)orbeEl("plannerActivity").value=activityIndex;
  if(orbeEl("plannerManager"))orbeEl("plannerManager").value=item.manager||"";
  if(orbeEl("plannerDuration"))orbeEl("plannerDuration").value=item.duration||"";
  if(orbeEl("plannerDependency")){
    const idx=state.plannedActivities.findIndex(x=>String(x.id)===String(item.dependencyId));
    orbeEl("plannerDependency").value=idx>=0?String(idx):"";
  }
  if(orbeEl("plannerShift"))orbeEl("plannerShift").value=item.shift||"Diurno";
  state.selectedEmployees=(item.employees||[]).map(e=>typeof e==="object"?e:state.employees.find(x=>String(x.id)===String(e))).filter(Boolean);
  renderEmployeeSelector();
  onActivitySelected();
  const add=orbeEl("addPlannerActivity");
  if(add)add.textContent="Guardar cambios";
  let cancel=orbeEl("cancelEditPlannerActivity");
  if(!cancel && add){
    cancel=document.createElement("button");cancel.type="button";cancel.id="cancelEditPlannerActivity";cancel.className="secondary";cancel.textContent="Cancelar edición";add.parentNode?.appendChild(cancel);
    cancel.addEventListener("click",cancelEditPlannerActivity);
  }
  document.querySelector("#plannerActivity")?.scrollIntoView({behavior:"smooth",block:"center"});
}
function cancelEditPlannerActivity(){
  ORBE.editId=null;
  state.editingPlanId = "";
  const add=orbeEl("addPlannerActivity");if(add)add.textContent="+ Agregar actividad";
  orbeEl("cancelEditPlannerActivity")?.remove();
  clearActivityForm(true);
}

/* Override add: same original calculation, but updates when editing. */
const __orbeAddOriginal = addPlannerActivity;


async function addPlannerActivityFinal(){

  /*
   * Si no estamos editando,
   * usamos la función normal de agregar.
   */
  if(!ORBE.editId){
    return __orbeAddOriginal();
  }

  const item=state.plannedActivities.find(
    x=>String(x.id)===String(ORBE.editId)
  );

  if(!item){
    ORBE.editId=null;
    return __orbeAddOriginal();
  }

  const activity=
    state.activities[
      Number(
        orbeEl("plannerActivity")?.value
      )
    ];

  if(
    !activity ||
    !state.selectedEmployees.length
  ){
    alert(
      "Selecciona actividad y al menos un empleado para formar el equipo."
    );
    return;
  }

  const recommendation=
    findYield(activity);

  if(!recommendation?.yield){
    alert(
      "Esta actividad no tiene rendimiento registrado."
    );
    return;
  }

  const entered=
    getInputDurationDays();

  const duration=
    Math.max(
      1,
      Math.ceil(
        entered>0
          ? entered
          : estimateDuration(
              activity,
              recommendation
            )
      )
    );

  const dep=
    getDependency();

  if(
    dep &&
    String(dep.id)===String(item.id)
  ){
    alert(
      "Una actividad no puede depender de sí misma."
    );
    return;
  }

  if(
    dep &&
    dependencyWouldCycle(
      item.id,
      dep.id
    )
  ){
    alert(
      "Esa dependencia crea un ciclo. Elige otra actividad."
    );
    return;
  }

  const start=
    calculateStartDate();

  const end=
    addWorkDays(
      start,
      duration-1
    );

  if(!validateProjectEnd(end)){
    alert(
      getProjectEndMessage(end)
    );
    return;
  }

  const previousEmployees=
    state.selectedEmployees;

  const previousShift=
    orbeEl("plannerShift")?.value ||
    "Diurno";

  const nextEmployees=
    getSelectedEmployees();

  const nextShift=
    orbeEl("plannerShift")?.value ||
    "Diurno";

  state.selectedEmployees=
    nextEmployees;

  if(
    alertBusyEmployees(
      start,
      end,
      item.sheetId || item.id
    )
  ){
    state.selectedEmployees=
      previousEmployees;

    state._availabilityShift=
      previousShift;

    return;
  }

  item.activityId=
    activity.id;

  item.phase=
    activity.phase;

  item.subarea=
    activity.subarea;

  item.name=
    activity.name;

  item.quantity=
    activity.quantity;

  item.unit=
    activity.unit;

  item.manager=
    orbeEl("plannerManager")?.value ||
    "";

  item.duration=
    duration;

  item.start=
    start;

  item.end=
    end;

  item.dependencyId=
    dep?.id || null;

  item.dependencyName=
    dep?.name || "";

  item.employees=
    nextEmployees;

  item.yield=
    recommendation.yield;

  item.yieldUnit=
    recommendation.yieldUnit || "";

  item.shift=
    nextShift;

  try{

    recalculateAllDates();

    for(
      const plan of state.plannedActivities
    ){

      if(plan.sheetId){
        await savePlan(plan);
      }

    }

    ORBE.editId=null;

    state.editingPlanId=
      "";

    orbeEl(
      "addPlannerActivity"
    ).textContent=
      "+ Agregar actividad";

    orbeEl(
      "cancelEditPlannerActivity"
    )?.remove();

    populateDependencies();

    renderAllPlannerViews();

    clearActivityForm(false);

  }catch(e){

    console.error(e);

    alert(
      "No se pudieron guardar los cambios:\n\n"+
      e.message
    );
  }
}

window.addPlannerActivity=
  addPlannerActivityFinal;

/* Add edit action to dependency nodes without destroying existing delete behavior. */
const __orbeRenderDependencyOriginal=renderDependencyScheme;
function renderDependencySchemeFinal(){
  __orbeRenderDependencyOriginal();
  const box=orbeEl("dependencyScheme");if(!box)return;
  box.querySelectorAll("[data-delete-plan]").forEach(btn=>{
    const edit=document.createElement("button");edit.type="button";edit.className="orbe-edit-plan";edit.textContent="Editar";
    edit.dataset.editPlan=btn.dataset.deletePlan;btn.parentNode?.insertBefore(edit,btn);
    edit.addEventListener("click",()=>beginEditPlannerActivity(edit.dataset.editPlan));
  });
}
window.renderDependencyScheme=renderDependencySchemeFinal;

/* =========================================================
   RUTA CRÍTICA / CPM
========================================================= */
function calculateCPM(){
  const acts=state.plannedActivities||[];
  const map=new Map(acts.map(a=>[String(a.id),a]));
  const info=new Map();
  acts.forEach(a=>info.set(String(a.id),{es:0,ef:Math.max(1,Number(a.duration)||1),ls:0,lf:0,slack:0,critical:false}));
  acts.forEach(a=>{
    const x=info.get(String(a.id));
    if(a.dependencyId && info.has(String(a.dependencyId))){const p=info.get(String(a.dependencyId));x.es=p.ef; x.ef=x.es+Math.max(1,Number(a.duration)||1);}
  });
  let changed=true, guard=0;
  while(changed&&guard++<acts.length+2){changed=false;acts.forEach(a=>{const x=info.get(String(a.id));let es=0;if(a.dependencyId&&info.has(String(a.dependencyId)))es=info.get(String(a.dependencyId)).ef;if(es!==x.es){x.es=es;x.ef=es+Math.max(1,Number(a.duration)||1);changed=true;}});}
  const projectEnd=Math.max(0,...[...info.values()].map(x=>x.ef));
  acts.slice().reverse().forEach(a=>{const x=info.get(String(a.id));const successors=acts.filter(b=>String(b.dependencyId)===String(a.id));x.lf=successors.length?Math.min(...successors.map(b=>info.get(String(b.id)).ls)):projectEnd;x.ls=x.lf-Math.max(1,Number(a.duration)||1);x.slack=x.ls-x.es;x.critical=x.slack<=0;});
  return {info,projectEnd};
}
function renderCriticalPath(){
  const host=orbeEl("dependencyScheme");if(!host)return;
  const result=calculateCPM();
  const old=host.querySelector(".orbe-critical-summary");old?.remove();
  if(!state.plannedActivities.length)return;
  const critical=state.plannedActivities.filter(a=>result.info.get(String(a.id))?.critical);
  const box=document.createElement("div");box.className="orbe-critical-summary";
  box.innerHTML=`<div><strong>Ruta crítica</strong><span>${critical.length} actividad(es) · ${result.projectEnd} días de duración de red</span></div><p>${critical.map(a=>orbeEscape(a.name)).join(" → ")||"Sin ruta crítica calculable"}</p>`;
  host.prepend(box);
}

/* =========================================================
   DISPONIBILIDAD DE PERSONAS ENTRE PROYECTOS
========================================================= */
function employeeBusyAcrossProjects(employeeId, start, end, excludePlanId=""){
  const s=parseDate(start),e=parseDate(end);if(!s||!e)return false;
  return (state.allPlans||[]).some(p=>{
    if(String(p.id)===String(excludePlanId))return false;
    if(!p.employees?.some(x=>String(typeof x==="object"?x.id:x)===String(employeeId)))return false;
    const ps=parseDate(p.start),pe=parseDate(p.end);
    if(!(ps&&pe&&s<=pe&&e>=ps)) return false;
    const currentShift = String(
      state._availabilityShift || $("plannerShift")?.value || "Diurno"
    );
    const planShift = String(p.shift || "Diurno");
    return currentShift === "Ambos" || planShift === "Ambos" || currentShift === planShift;
  });
}

function getBusyEmployees(start,end,excludePlanId=""){
  state._availabilityShift = $("plannerShift")?.value || "Diurno";
  return state.selectedEmployees.filter(employee=>
    employeeBusyAcrossProjects(employee.id,start,end,excludePlanId)
  );
}

function alertBusyEmployees(start,end,excludePlanId=""){
  const busy=getBusyEmployees(start,end,excludePlanId);
  if(!busy.length)return false;
  const names=busy.map(e=>e.name).join(", ");
  alert(
    `No se puede asignar el equipo en esas fechas.\n\n`+
    `Estas personas ya están ocupadas:\n${names}\n\n`+
    `Cambia las fechas, la dependencia o selecciona otro equipo.`
  );
  return true;
}

/* Add a compact availability line to the current selector. */
function refreshEmployeeAvailability(){
  document.querySelectorAll(".employee-option").forEach(option=>{
    const input=option.querySelector("input[type=checkbox]");if(!input)return;
    const emp=state.employees.find(x=>String(x.id)===String(input.value));
    if(!emp)return;
    option.title="Disponible / ocupación se valida al planificar";
  });
}

/* =========================================================
   EXPORTACIÓN EXCEL
========================================================= */
async function exportMasterExcel(){
  const rows=(state.plannedActivities||[]).map((item,i)=>[i+1,item.phase||"",item.name||"",item.manager||"",formatISODate(item.start),formatISODate(item.end),(item.employees||[]).map(e=>e.name||e).join(", "),item.duration||""]);

  if(!window.XLSX){
    try{
      await new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.onload=resolve;
        script.onerror=reject;
        document.head.appendChild(script);
      });
    }catch(error){
      exportCSV();
      alert("No se pudo cargar el exportador XLSX. Se descargó un CSV compatible con Excel.");
      return;
    }
  }

  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([["#","Fase","Actividad","Encargado","Inicio","Fin","Equipo","Duración"],...rows]);
  XLSX.utils.book_append_sheet(wb,ws,"Cronograma");
  XLSX.writeFile(wb,`${(state.currentProject?.name||"planificador").replace(/[^a-z0-9]+/gi,"_")}.xlsx`);
}


/* =========================================================
   INIT FINAL
========================================================= */
function injectFinalVisualStyles(){
  if (document.getElementById("orbeFinalStyles")) return;
  const style = document.createElement("style");
  style.id = "orbeFinalStyles";
  style.textContent = `
    #orbeScenarioCalculator{background:#fff;border:1px solid #e2e6df;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.04)}
    #orbeScenarioCalculator .orbe-calc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:22px;border-bottom:1px solid #edf0ec}
    #orbeScenarioCalculator .orbe-calc-kicker{font:700 9px/1 "DM Mono",monospace;letter-spacing:.14em;color:#7f887f}
    #orbeScenarioCalculator h3{margin:8px 0 5px;font-size:22px;letter-spacing:-.03em}
    #orbeScenarioCalculator p{margin:0;color:#7a827b;font-size:11px;line-height:1.55}
    #orbeScenarioCalculator .orbe-mode-toggle{display:flex;gap:6px;background:#f2f4f0;padding:4px;border-radius:8px}
    #orbeScenarioCalculator .orbe-mode-toggle button{border:0;background:transparent;padding:8px 11px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;color:#66705f}
    #orbeScenarioCalculator .orbe-mode-toggle button.active{background:#1b1d1b;color:#fff}
    #orbeScenarioCalculator .orbe-calc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:18px 22px}
    #orbeScenarioCalculator .orbe-calc-grid label{display:grid;gap:5px;font-size:9px;font-weight:800;color:#697169;text-transform:uppercase}
    #orbeScenarioCalculator .orbe-calc-grid input{width:100%;box-sizing:border-box;height:38px;border:1px solid #dfe4df;border-radius:7px;padding:0 10px;font-size:11px;background:#fff}
    #orbeScenarioCalculator .orbe-calc-grid small{font-size:8px;color:#8b938d;text-transform:none}
    #orbeScenarioCalculator .orbe-results{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 22px 18px}
    #orbeScenarioCalculator .orbe-results article{border:1px solid #e6eae4;border-radius:10px;padding:14px;background:#fbfcfa}
    #orbeScenarioCalculator .orbe-results span{display:block;font:700 8px "DM Mono",monospace;letter-spacing:.08em;color:#858c87}
    #orbeScenarioCalculator .orbe-results strong{display:block;margin:7px 0 4px;font-size:20px;letter-spacing:-.03em}
    #orbeScenarioCalculator .orbe-results small{color:#7e877f;font-size:9px;line-height:1.4}
    #orbeScenarioCalculator .orbe-scenario-table-wrap{padding:0 22px 22px}
    #orbeScenarioCalculator .orbe-table-title{font:700 9px "DM Mono",monospace;color:#727b73;text-transform:uppercase;letter-spacing:.08em;margin:4px 0 8px}
    #orbeScenarioCalculator .orbe-scenario-table{width:100%;border-collapse:collapse;font-size:10px}
    #orbeScenarioCalculator .orbe-scenario-table th,#orbeScenarioCalculator .orbe-scenario-table td{text-align:left;padding:9px 8px;border-bottom:1px solid #eef1ed}
    #orbeScenarioCalculator .orbe-scenario-table th{font:700 8px "DM Mono",monospace;color:#8a918c;text-transform:uppercase}
    #orbeScenarioCalculator .orbe-scenario-table tr.active td{background:#f3f7e9;font-weight:800}
    .employee-option{display:grid!important;grid-template-columns:auto 30px 1fr;align-items:center;gap:8px;min-height:48px;padding:9px!important}
    .employee-avatar{width:30px;height:30px;border-radius:8px;background:#eef3e6;color:#657438;display:grid;place-items:center;font:800 9px "DM Mono",monospace}
    .employee-text{display:grid!important;gap:2px!important;min-width:0}
    .employee-availability{display:flex;align-items:center;gap:4px;font-size:7px!important;font-style:normal;color:#7f887f}
    .employee-availability i{width:5px;height:5px;border-radius:50%;background:#9cc51f;display:inline-block}
    .employee-availability.busy{color:#a25b55}
    .employee-availability.busy i{background:#c96d62}
    .dependency-tree{display:grid;gap:10px;padding:4px 2px}
    .dependency-tree-children{margin-left:25px;padding-left:14px;border-left:1px solid #dde4d6;display:grid;gap:10px}
    .dependency-link{font:700 9px "DM Mono",monospace;color:#9aa39b;padding:0 0 0 7px}
    .dependency-node{background:#fff;border:1px solid #e5e9e3;border-radius:10px;padding:10px;box-shadow:0 2px 7px rgba(0,0,0,.025)}
    body.print-master-only *{visibility:hidden!important}
    body.print-master-only .master-table-card,body.print-master-only .master-table-card *{visibility:visible!important}
    body.print-master-only .master-table-card{position:absolute;inset:0;width:auto;margin:0;border:0;box-shadow:none}
    body.print-master-only .master-actions,body.print-master-only .master-filters{display:none!important}
    @media(max-width:850px){
      #orbeScenarioCalculator .orbe-calc-head{flex-direction:column}
      #orbeScenarioCalculator .orbe-calc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      #orbeScenarioCalculator .orbe-results{grid-template-columns:1fr}
    }
    @media(max-width:520px){#orbeScenarioCalculator .orbe-calc-grid{grid-template-columns:1fr}}
    @media print{body.print-master-only{background:#fff}body.print-master-only .master-table-card{position:static!important;margin:0!important}}
  `;
  document.head.appendChild(style);
}

function injectRestoredScenarioExactStyles(){
  return;
}
function installFinalPatch(){
  injectFinalVisualStyles();
  injectRestoredScenarioExactStyles();
  mountScenarioCalculator();
  refreshEmployeeAvailability();
  /* Rebind button because original bindEvents captured the old function. */
  const add=orbeEl("addPlannerActivity");
  if(add){add.replaceWith(add.cloneNode(true));orbeEl("addPlannerActivity").addEventListener("click",addPlannerActivityFinal);}
  const exportBtn=orbeEl("exportMasterTable");
  if(exportBtn){exportBtn.replaceWith(exportBtn.cloneNode(true));orbeEl("exportMasterTable").addEventListener("click",exportMasterExcel);orbeEl("exportMasterTable").textContent="Exportar Excel";}
  /* expose useful commands */
  window.OrbePlanner={
    ...(window.OrbePlanner||{}),
    calculateScenario:calculateOrbeScenario,
    criticalPath:calculateCPM,
    exportExcel:exportMasterExcel,
    editActivity:beginEditPlannerActivity,
    cancelEdit:cancelEditPlannerActivity,
    availability:employeeBusyAcrossProjects
  };
  window.employeeBusyAcrossProjects = employeeBusyAcrossProjects;
  window.refreshScenarioActivities = populateScenarioActivities;
  try{ populateScenarioActivities(); }catch(e){ console.warn(e); }
  renderCriticalPath();
}

/* Wait one tick so V3 initialization and Sheets data are complete. */
setTimeout(installFinalPatch,0);
setTimeout(()=>{try{renderCriticalPath();refreshEmployeeAvailability();}catch(e){console.warn(e);}},800);
/* =========================================================
   V5 — DEPENDENCIAS MÚLTIPLES + FS / SS / FF
========================================================= */

function v5ParseDependencyString(rawValue) {
  const text = String(rawValue ?? "").trim();

  if (!text) {
    return [];
  }

  return text
    .split(",")
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      const parts = token.split("|");

      return {
        id: String(parts[0] || "").trim(),
        type: String(parts[1] || "FS").trim().toUpperCase()
      };
    })
    .filter(item => item.id);
}


function v5NormalizeDependencies(value) {

  if (Array.isArray(value)) {

    return value
      .map(item => ({
        id: String(
          item?.id ||
          item?.dependencyId ||
          ""
        ).trim(),

        type: String(
          item?.type ||
          "FS"
        ).trim().toUpperCase()
      }))
      .filter(
        item =>
          item.id &&
          ["FS", "SS", "FF"].includes(item.type)
      );
  }

  return v5ParseDependencyString(value)
    .map(item => ({
      id: item.id,
      type:
        ["FS", "SS", "FF"].includes(item.type)
          ? item.type
          : "FS"
    }));
}


function v5EncodeDependencies(list) {

  return v5NormalizeDependencies(list)
    .map(
      item =>
        `${item.id}|${item.type}`
    )
    .join(",");
}


function v5GetDependencies(plan) {

  if (
    Array.isArray(plan?.dependencies) &&
    plan.dependencies.length
  ) {
    return v5NormalizeDependencies(
      plan.dependencies
    );
  }

  if (plan?.dependencyId) {
    return [
      {
        id: String(plan.dependencyId),
        type: String(
          plan.dependencyType ||
          "FS"
        ).toUpperCase()
      }
    ];
  }

  return [];
}


function v5SetDependencies(plan, list) {

  const deps =
    v5NormalizeDependencies(list);

  plan.dependencies = deps;

  plan.dependencyId =
    deps[0]?.id ||
    null;

  plan.dependencyType =
    deps[0]?.type ||
    "FS";

  plan.dependencyName =
    deps
      .map(dep => {

        const found =
          state.plannedActivities.find(
            item =>
              String(item.id) ===
              String(dep.id)
          );

        return found
          ? `${found.name} (${dep.type})`
          : `${dep.id} (${dep.type})`;
      })
      .join(", ");
}


/* =========================================================
   NORMALIZAR PLAN
========================================================= */

function normalizePlan(raw) {

  const team =
    raw.EQUIPO ??
    raw.equipo ??
    "";

  const employeeIds =
    Array.isArray(team)
      ? team
          .map(String)
          .filter(Boolean)
      : String(team)
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);

  const encodedDeps =
    raw.DEPENDENCIA ??
    raw.dependencyIds ??
    raw.dependencyId ??
    "";

  const dependencies =
    v5NormalizeDependencies(
      encodedDeps
    );

  const dependencyId =
    dependencies[0]?.id ||
    "";

  const dependencyType =
    dependencies[0]?.type ||
    "FS";

  return {

    id:
      raw.ID_PLAN ??
      raw.id ??
      "",

    projectId:
      raw.ID_PROYECTO ??
      raw.projectId ??
      "",

    activityId:
      raw.ID_ACTIVIDAD ??
      raw.activityId ??
      "",

    phase:
      raw.FASE ??
      raw.phase ??
      "",

    subarea:
      raw.SUBÁREA ??
      raw.SUBAREA ??
      raw.subarea ??
      "",

    name:
      raw.ACTIVIDAD ??
      raw.name ??
      "",

    quantity:
      number(
        raw.CANTIDAD ??
        raw.quantity
      ),

    unit:
      raw.UNIDAD ??
      raw.unit ??
      "",

    yield:
      number(
        raw.RENDIMIENTO ??
        raw.yield
      ),

    yieldUnit:
      raw.UNIDAD_RENDIMIENTO ??
      raw.yieldUnit ??
      "",

    duration:
      number(
        raw.DURACION ??
        raw.duration,
        1
      ),

    start:
      parseDate(
        raw.INICIO ??
        raw.start
      ),

    end:
      parseDate(
        raw.FIN ??
        raw.end
      ),

    shift:
      raw.TURNO ??
      raw.shift ??
      "Diurno",

    dependencies,

    dependencyId,

    dependencyType,

    dependencyName:
      dependencies
        .map(dep => {

          const found =
            state.plannedActivities?.find(
              item =>
                String(item.id) ===
                String(dep.id)
            );

          return found
            ? `${found.name} (${dep.type})`
            : `${dep.id} (${dep.type})`;
        })
        .join(", "),

    manager:
      raw.ENCARGADO ??
      raw.manager ??
      "",

    employees:
      employeeIds,

    status:
      raw.ESTADO ??
      raw.status ??
      "Pendiente"
  };
}


function v5NormalizeExistingPlan(plan) {

  if (!plan) {
    return plan;
  }

  const deps =
    v5GetDependencies(plan);

  plan.dependencies =
    deps;

  plan.dependencyId =
    deps[0]?.id ||
    null;

  plan.dependencyType =
    deps[0]?.type ||
    "FS";

  plan.dependencyName =
    deps
      .map(dep => {

        const found =
          state.plannedActivities.find(
            item =>
              String(item.id) ===
              String(dep.id)
          );

        return found
          ? `${found.name} (${dep.type})`
          : `${dep.id} (${dep.type})`;
      })
      .join(", ");

  return plan;
}


/* =========================================================
   SELECTOR DE DEPENDENCIAS
========================================================= */

/* =========================================================
   SELECTOR DE DEPENDENCIAS
========================================================= */

function readDependencyPickerLinks(){

  const select =
    $("plannerDependency");

  if(!select){
    return [];
  }

  try{

    return v5NormalizeDependencies(
      JSON.parse(
        select.dataset.dependencyLinks || "[]"
      )
    );

  }catch(error){

    console.warn(
      "No se pudieron leer las dependencias:",
      error
    );

    return [];
  }
}


function setDependencyPickerLinks(
  links = []
){

  const select =
    $("plannerDependency");

  if(!select){
    return;
  }

  const normalized =
    v5NormalizeDependencies(
      links
    );

  select.dataset.dependencyLinks =
    JSON.stringify(
      normalized
    );

  select.value = "";

  renderDependencyRules();
}


function dependencyRelationLabel(
  type
){

  switch(
    String(type || "FS")
      .toUpperCase()
  ){

    case "SS":
      return "Empezar cuando empiece";

    case "FF":
      return "Terminar cuando termine";

    case "FS":
    default:
      return "Empezar después de que termine";
  }
}


/* =========================================================
   INICIALIZAR SELECTOR
========================================================= */

function ensureDependencyPicker(){

  const select =
    $("plannerDependency");

  if(!select){
    return null;
  }

  /*
   * Selector simple.
   * Cada selección se agrega a la lista
   * de dependencias debajo.
   */

  select.multiple = false;
  select.size = 1;

  select.style.minHeight = "";
  select.style.height = "";
  select.style.padding = "";

  select.dataset.v5DependencyPicker =
    "1";

  if(!select.dataset.dependencyLinks){

    select.dataset.dependencyLinks =
      "[]";

  }

  let rules =
    $("plannerDependencyRules");

  if(!rules){

    rules =
      document.createElement(
        "div"
      );

    rules.id =
      "plannerDependencyRules";

    select.parentElement?.appendChild(
      rules
    );
  }

  select.removeEventListener(
    "change",
    addDependencyFromPicker
  );

  select.addEventListener(
    "change",
    addDependencyFromPicker
  );

  return select;
}
/* =========================================================
   AGREGAR UNA DEPENDENCIA DESDE EL SELECT
========================================================= */

function addDependencyFromPicker(){

  const select =
    $("plannerDependency");

  if(
    !select ||
    !select.value
  ){
    return;
  }


  const activity =
    state.plannedActivities[
      Number(
        select.value
      )
    ];

  if(!activity){

    select.value = "";

    return;
  }


  /*
   * Evitar que una actividad dependa
   * de sí misma cuando estamos editando.
   */

  if(
    ORBE.editId &&
    String(activity.id) ===
    String(ORBE.editId)
  ){

    alert(
      "Una actividad no puede depender de sí misma."
    );

    select.value = "";

    return;
  }


  const links =
    readDependencyPickerLinks();


  const exists =
    links.some(
      dep =>
        String(dep.id) ===
        String(activity.id)
    );


  if(!exists){

    links.push({

      id:
        activity.id,

      type:
        "FS"

    });

  }


  setDependencyPickerLinks(
    links
  );
}


/* =========================================================
   POBLAR DEPENDENCIAS
========================================================= */

function populateDependencies(){

  const select =
    ensureDependencyPicker();

  if(!select){
    return;
  }


  /*
   * Conservamos las dependencias actuales
   * por ID y no por posición.
   */

  const existingLinks =
    readDependencyPickerLinks();


  select.innerHTML =
    `<option value="">
      Selecciona una dependencia...
    </option>`;


  state.plannedActivities.forEach(
    (activity,index) => {

      /*
       * Mientras editamos una actividad,
       * esa misma actividad no debe aparecer
       * como posible dependencia.
       */

      if(
        ORBE.editId &&
        String(activity.id) ===
        String(ORBE.editId)
      ){
        return;
      }


      const option =
        document.createElement(
          "option"
        );

      option.value =
        String(index);

      option.textContent =
        `${index + 1}. ${activity.name}`;

      select.appendChild(
        option
      );

    }
  );


  /*
   * Quitamos referencias a actividades
   * que ya no existen.
   */

  const validIds =
    new Set(
      state.plannedActivities.map(
        activity =>
          String(activity.id)
      )
    );


  const validLinks =
    existingLinks.filter(
      dep =>
        validIds.has(
          String(dep.id)
        )
    );


  select.dataset.dependencyLinks =
    JSON.stringify(
      validLinks
    );


  select.value = "";


  renderDependencyRules();
}


/* =========================================================
   MOSTRAR DEPENDENCIAS
========================================================= */

function renderDependencyRules(){

  const rules =
    $("plannerDependencyRules");

  if(!rules){
    return;
  }

  const links =
    readDependencyPickerLinks();

  rules.innerHTML = "";

  /*
   * Si no hay dependencias,
   * simplemente no mostramos nada.
   */

  if(!links.length){
    return;
  }


  links.forEach(
    link => {

      const activity =
        state.plannedActivities.find(
          item =>
            String(item.id) ===
            String(link.id)
        );


      if(!activity){
        return;
      }


      const row =
        document.createElement(
          "div"
        );

      row.className =
        "planner-dependency-row";


      /* NOMBRE */

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "planner-dependency-name";

      name.textContent =
        activity.name;


      /* RELACIÓN */

      const relation =
        document.createElement(
          "div"
        );

      relation.className =
        "planner-dependency-relation";


      const type =
        String(
          link.type || "FS"
        ).toUpperCase();


      if(type === "SS"){

        relation.textContent =
          "Empieza junto con esta actividad";

      }else if(type === "FF"){

        relation.textContent =
          "Termina junto con esta actividad";

      }else{

        relation.textContent =
          "Espera a que termine";

      }


      /*
       * ELIMINAR
       */

      const remove =
        document.createElement(
          "button"
        );

      remove.type =
        "button";

      remove.className =
        "planner-dependency-remove";

      remove.textContent =
        "×";

      remove.title =
        "Quitar dependencia";


      remove.addEventListener(
        "click",
        () => {

          const updated =
            readDependencyPickerLinks()
              .filter(
                dep =>
                  String(dep.id) !==
                  String(activity.id)
              );


          setDependencyPickerLinks(
            updated
          );

        }
      );


      row.appendChild(
        name
      );

      row.appendChild(
        relation
      );

      row.appendChild(
        remove
      );


      rules.appendChild(
        row
      );

    }
  );
}


/* =========================================================
   OBTENER DEPENDENCIAS PARA GUARDAR
========================================================= */

function getDependencyLinks(){

  return readDependencyPickerLinks();

}

function getDependency() {

  const deps =
    getDependencyLinks();

  if (!deps.length) {
    return null;
  }

  return state.plannedActivities.find(
    item =>
      String(item.id) ===
      String(deps[0].id)
  ) || null;
}


/* =========================================================
   EVITAR CICLOS
========================================================= */

function dependencyWouldCycle(
  activityId,
  dependencyId
) {

  if (
    !activityId ||
    !dependencyId
  ) {
    return false;
  }

  const target =
    String(activityId);

  const stack =
    [String(dependencyId)];

  const seen =
    new Set();

  while (
    stack.length
  ) {

    const current =
      stack.pop();

    if (
      !current ||
      seen.has(current)
    ) {
      continue;
    }

    if (
      current === target
    ) {
      return true;
    }

    seen.add(
      current
    );

    const item =
      state.plannedActivities.find(
        x =>
          String(x.id) ===
          current
      );

    v5GetDependencies(
      item
    ).forEach(
      dep =>
        stack.push(
          String(dep.id)
        )
    );
  }

  return false;
}


/* =========================================================
   FECHAS FS / SS / FF
========================================================= */

function subtractWorkDays(
  value,
  amount
) {

  let d =
    parseDate(value);

  if (!d) {
    return null;
  }

  let remaining =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  while (
    remaining > 0
  ) {

    d =
      addDays(
        d,
        -1
      );

    if (
      isWorkingDay(d)
    ) {
      remaining--;
    }
  }

  return nextWorkingDay(d);
}


function v5MaxDate(
  a,
  b
) {

  const da =
    parseDate(a);

  const db =
    parseDate(b);

  if (!da) {
    return db;
  }

  if (!db) {
    return da;
  }

  return da.getTime() >= db.getTime()
    ? da
    : db;
}


function v5CandidateStart(
  dependency,
  type,
  duration
) {

  if (!dependency) {
    return null;
  }

  const t =
    String(
      type || "FS"
    ).toUpperCase();

  if (
    t === "SS"
  ) {
    return nextWorkingDay(
      dependency.start
    );
  }

  if (
    t === "FF"
  ) {
    return subtractWorkDays(
      dependency.end,
      Math.max(
        1,
        Number(duration) || 1
      ) - 1
    );
  }

  return addWorkDays(
    dependency.end,
    1
  );
}


function v5CalculateStartForDependencies(
  duration,
  links
) {

  let start =
    nextWorkingDay(
      state.currentProject?.start ||
      CONFIG.projectStart
    );

  const deps =
    v5NormalizeDependencies(
      links
    );

  deps.forEach(
    link => {

      const dependency =
        state.plannedActivities.find(
          item =>
            String(item.id) ===
            String(link.id)
        );

      const candidate =
        v5CandidateStart(
          dependency,
          link.type,
          duration
        );

      start =
        v5MaxDate(
          start,
          candidate
        );
    }
  );

  return start;
}


function calculateStartDate() {

  const duration =
    Math.max(
      1,
      Math.ceil(
        getInputDurationDays() ||
        1
      )
    );

  return v5CalculateStartForDependencies(
    duration,
    getDependencyLinks()
  );
}


/* =========================================================
   GUARDAR DEPENDENCIAS
========================================================= */

function planToPayload(
  planned
) {

  return {

    ID_PLAN:
      planned.sheetId ||
      planned.id ||
      "",

    ID_PROYECTO:
      state.currentProject.id,

    ID_ACTIVIDAD:
      planned.activityId,

    FASE:
      planned.phase,

    SUBÁREA:
      planned.subarea ||
      "",

    ACTIVIDAD:
      planned.name,

    CANTIDAD:
      planned.quantity,

    UNIDAD:
      planned.unit,

    RENDIMIENTO:
      planned.yield ||
      "",

    UNIDAD_RENDIMIENTO:
      planned.yieldUnit ||
      "",

    DURACION:
      planned.duration,

    INICIO:
      formatISODate(
        planned.start
      ),

    FIN:
      formatISODate(
        planned.end
      ),

    ENCARGADO:
      planned.manager ||
      "",

    TURNO:
      planned.shift ||
      "Diurno",

    DEPENDENCIA:
      v5EncodeDependencies(
        planned.dependencies ||
        (
          planned.dependencyId
            ? [{
                id:
                  planned.dependencyId,
                type:
                  planned.dependencyType ||
                  "FS"
              }]
            : []
        )
      ),

    EQUIPO:
      (planned.employees || [])
        .map(
          employee =>
            typeof employee === "object"
              ? employee.id
              : employee
        )
        .filter(Boolean)
        .join(","),

    ESTADO:
      planned.status ||
      "Pendiente"
  };
}


async function savePlan(
  planned
) {

  const oldId =
    planned.sheetId ||
    planned.id ||
    "";

  const result =
    await api(
      "saveActivity",
      planToPayload(
        planned
      )
    );

  planned.id =
    result.id;

  planned.sheetId =
    result.id;

  if (
    oldId &&
    String(oldId) !==
    String(result.id)
  ) {

    state.plannedActivities.forEach(
      item => {

        if (
          item === planned
        ) {
          return;
        }

        const deps =
          v5GetDependencies(
            item
          ).map(
            dep =>
              String(dep.id) ===
              String(oldId)
                ? {
                    ...dep,
                    id:
                      result.id
                  }
                : dep
          );

        v5SetDependencies(
          item,
          deps
        );
      }
    );
  }

  const normalized =
    normalizePlan(
      {
        ...planToPayload(
          planned
        ),

        ID_PLAN:
          result.id
      }
    );

  const index =
    state.allPlans.findIndex(
      item =>
        String(item.id) ===
        String(result.id)
    );

  if (
    index >= 0
  ) {
    state.allPlans[index] =
      normalized;
  } else {
    state.allPlans.push(
      normalized
    );
  }

  return result;
}


/* =========================================================
   RECALCULAR FECHAS
========================================================= */

function recalculateAllDates() {

  const activities =
    state.plannedActivities ||
    [];

  const byId =
    new Map(
      activities.map(
        a => [
          String(a.id),
          a
        ]
      )
    );

  const done =
    new Set();

  const visiting =
    new Set();

  function visit(
    activity
  ) {

    const id =
      String(activity.id);

    if (
      done.has(id)
    ) {
      return;
    }

    if (
      visiting.has(id)
    ) {
      return;
    }

    visiting.add(id);

    const duration =
      Math.max(
        1,
        Number(activity.duration) ||
        1
      );

    let start =
      nextWorkingDay(
        state.currentProject?.start ||
        CONFIG.projectStart
      );

    const deps =
      v5GetDependencies(
        activity
      );

    deps.forEach(
      link => {

        const dependency =
          byId.get(
            String(link.id)
          );

        if (!dependency) {
          return;
        }

        visit(
          dependency
        );

        const candidate =
          v5CandidateStart(
            dependency,
            link.type,
            duration
          );

        start =
          v5MaxDate(
            start,
            candidate
          );
      }
    );

    activity.start =
      start;

    activity.end =
      addWorkDays(
        start,
        duration - 1
      );

    visiting.delete(id);
    done.add(id);
  }

  activities.forEach(
    visit
  );
}


/* =========================================================
   EDICIÓN
========================================================= */

function beginEditPlannerActivity(
  id
) {

  const item =
    state.plannedActivities.find(
      x =>
        String(x.id) ===
        String(id)
    );

  if (!item) {
    return;
  }

  ORBE.editId =
    item.id;

  state.editingPlanId =
    item.id;

  ensureDependencyPicker();

  populateDependencies();

  const activityIndex =
    state.activities.findIndex(
      x =>
        String(x.id) ===
        String(item.activityId)
    );

  if (
    $("plannerActivity") &&
    activityIndex >= 0
  ) {
    $("plannerActivity").value =
      activityIndex;
  }

  if (
    $("plannerManager")
  ) {
    $("plannerManager").value =
      item.manager ||
      "";
  }

  if (
    $("plannerDuration")
  ) {
    $("plannerDuration").value =
      item.duration ||
      "";
  }

  if (
    $("plannerShift")
  ) {
    $("plannerShift").value =
      item.shift ||
      "Diurno";
  }

  onActivitySelected();

    setDependencyPickerLinks(
    v5GetDependencies(
      item
    )
  );

  state.selectedEmployees =
    (item.employees || [])
      .map(
        e =>
          typeof e === "object"
            ? e
            : state.employees.find(
                x =>
                  String(x.id) ===
                  String(e)
              )
      )
      .filter(Boolean);

  renderEmployeeSelector();

  const add =
    $("addPlannerActivity");

  if (add) {
    add.textContent =
      "Guardar cambios";
  }

  let cancel =
    $("cancelEditPlannerActivity");

  if (
    !cancel &&
    add
  ) {

    cancel =
      document.createElement(
        "button"
      );

    cancel.type =
      "button";

    cancel.id =
      "cancelEditPlannerActivity";

    cancel.className =
      "secondary";

    cancel.textContent =
      "Cancelar edición";

    add.parentNode?.appendChild(
      cancel
    );

    cancel.addEventListener(
      "click",
      cancelEditPlannerActivity
    );
  }

  document
    .querySelector(
      "#plannerActivity"
    )
    ?.scrollIntoView({
      behavior:
        "smooth",
      block:
        "center"
    });
}


/* =========================================================
   ELIMINAR ACTIVIDAD
========================================================= */

function removePlannerActivity(
  id
) {

  const index =
    state.plannedActivities.findIndex(
      item =>
        String(item.id) ===
        String(id)
    );

  if (
    index < 0
  ) {
    return;
  }

  const planned =
    state.plannedActivities[
      index
    ];

  if (
    !confirm(
      `¿Eliminar "${planned.name}" del proyecto?`
    )
  ) {
    return;
  }

  const finish =
    async () => {

      if (
        planned.sheetId
      ) {

        await api(
          "deleteActivity",
          null,
          planned.sheetId
        );

        state.allPlans =
          state.allPlans.filter(
            item =>
              String(item.id) !==
              String(planned.sheetId)
          );
      }

      state.plannedActivities.splice(
        index,
        1
      );

      state.plannedActivities.forEach(
        item => {

          const deps =
            v5GetDependencies(
              item
            ).filter(
              dep =>
                String(dep.id) !==
                String(id)
            );

          v5SetDependencies(
            item,
            deps
          );
        }
      );

      recalculateAllDates();

      for (
        const item
        of state.plannedActivities
      ) {

        if (
          item.sheetId
        ) {
          await savePlan(
            item
          );
        }
      }

      populateDependencies();

      renderAllPlannerViews();
    };

  finish().catch(
    error => {

      console.error(
        error
      );

      alert(
        "No se pudo eliminar la actividad:\n\n" +
        error.message
      );
    }
  );
}


/* =========================================================
   LIMPIAR FORMULARIO
========================================================= */

function clearActivityForm(
  clearActivity = true
) {

  if (
    clearActivity &&
    $("plannerActivity")
  ) {
    $("plannerActivity").value =
      "";
  }

  if (
    $("plannerPhase")
  ) {
    $("plannerPhase").value =
      "";
  }

setDependencyPickerLinks(
  []
);

  if (
    $("plannerDuration")
  ) {
    $("plannerDuration").value =
      "";
  }

  if (
    $("plannerManager")
  ) {
    $("plannerManager").value =
      "";
  }

  state.selectedEmployees =
    [];

  renderEmployeeSelector();

  renderActivityInfo();

  calculatePlannerRequirement();
}


/* =========================================================
   AGREGAR / EDITAR ACTIVIDAD
========================================================= */

async function addPlannerActivityFinal() {

  const editing =
    !!ORBE.editId;

  const item =
    editing
      ? state.plannedActivities.find(
          x =>
            String(x.id) ===
            String(
              ORBE.editId
            )
        )
      : null;

  if (
    editing &&
    !item
  ) {

    ORBE.editId =
      null;

    return;
  }

  const activityIndex =
    Number(
      $("plannerActivity")?.value
    );

  const activity =
    state.activities[
      activityIndex
    ];

  if (!activity) {
    alert(
      "Selecciona una actividad."
    );
    return;
  }

  if (
    !state.selectedEmployees.length
  ) {

    alert(
      "Selecciona al menos un empleado para formar el equipo."
    );

    return;
  }

  const recommendation =
    findYield(
      activity
    );

  if (
    !recommendation?.yield
  ) {

    alert(
      "Esta actividad no tiene rendimiento registrado."
    );

    return;
  }

  const entered =
    getInputDurationDays();

  const duration =
    Math.max(
      1,
      Math.ceil(
        entered > 0
          ? entered
          : estimateDuration(
              activity,
              recommendation
            )
      )
    );

  if (!duration) {

    alert(
      "No se pudo calcular una duración válida."
    );

    return;
  }

  const links =
    getDependencyLinks();

  if (editing) {

    for (
      const link
      of links
    ) {

      if (
        String(link.id) ===
          String(item.id) ||
        dependencyWouldCycle(
          item.id,
          link.id
        )
      ) {

        alert(
          "Esa dependencia crea un ciclo. Elige otra actividad."
        );

        return;
      }
    }
  }

  const start =
    v5CalculateStartForDependencies(
      duration,
      links
    );

  const end =
    addWorkDays(
      start,
      duration - 1
    );

  const excludeId =
    editing
      ? (
          item.sheetId ||
          item.id
        )
      : "";

  if (
    state.currentProject &&
    !validateProjectEnd(
      end
    )
  ) {

    alert(
      getProjectEndMessage(
        end
      )
    );

    return;
  }

  if (
    state.currentProject &&
    alertBusyEmployees(
      start,
      end,
      excludeId
    )
  ) {
    return;
  }


  if (editing) {

    item.activityId =
      activity.id;

    item.phase =
      activity.phase;

    item.subarea =
      activity.subarea;

    item.name =
      activity.name;

    item.quantity =
      activity.quantity;

    item.unit =
      activity.unit;

    item.manager =
      $("plannerManager")?.value ||
      "";

    item.duration =
      duration;

    item.start =
      start;

    item.end =
      end;

    item.dependencies =
      links;

    item.dependencyId =
      links[0]?.id ||
      null;

    item.dependencyType =
      links[0]?.type ||
      "FS";

    item.dependencyName =
      links
        .map(
          link => {

            const found =
              state.plannedActivities.find(
                x =>
                  String(x.id) ===
                  String(link.id)
              );

            return found
              ? `${found.name} (${link.type})`
              : `${link.id} (${link.type})`;
          }
        )
        .join(", ");

    item.employees =
      getSelectedEmployees();

    item.yield =
      recommendation.yield;

    item.yieldUnit =
      recommendation.yieldUnit ||
      "";

    item.shift =
      $("plannerShift")?.value ||
      "Diurno";


    try {

      recalculateAllDates();

      for (
        const plan
        of state.plannedActivities
      ) {

        if (
          plan.sheetId
        ) {
          await savePlan(
            plan
          );
        }
      }

      ORBE.editId =
        null;

      state.editingPlanId =
        "";

      $("addPlannerActivity").textContent =
        "+ Agregar actividad";

      $("cancelEditPlannerActivity")
        ?.remove();

      populateDependencies();

      renderAllPlannerViews();

      clearActivityForm(
        false
      );

    } catch (
      error
    ) {

      console.error(
        error
      );

      alert(
        "No se pudieron guardar los cambios:\n\n" +
        error.message
      );
    }

    return;
  }


  const planned = {

    id:
      `LOCAL-${Date.now()}`,

    sheetId:
      "",

    projectId:
      state.currentProject?.id ||
      "",

    activityId:
      activity.id,

    phase:
      activity.phase,

    subarea:
      activity.subarea,

    name:
      activity.name,

    quantity:
      activity.quantity,

    unit:
      activity.unit,

    manager:
      $("plannerManager")?.value ||
      "",

    start,

    end,

    duration,

    dependencies:
      links,

    dependencyId:
      links[0]?.id ||
      null,

    dependencyType:
      links[0]?.type ||
      "FS",

    dependencyName:
      links
        .map(
          link => {

            const found =
              state.plannedActivities.find(
                x =>
                  String(x.id) ===
                  String(link.id)
              );

            return found
              ? `${found.name} (${link.type})`
              : `${link.id} (${link.type})`;
          }
        )
        .join(", "),

    employees:
      getSelectedEmployees(),

    yield:
      recommendation.yield,

    yieldUnit:
      recommendation.yieldUnit ||
      "",

    shift:
      $("plannerShift")?.value ||
      "Diurno",

    status:
      "Pendiente"
  };

  state.plannedActivities.push(
    planned
  );

  recalculateAllDates();

  populateDependencies();

  renderAllPlannerViews();

  clearActivityForm(
    false
  );
}


/* =========================================================
   RUTA CRÍTICA — MÚLTIPLES DEPENDENCIAS
========================================================= */

function calculateCPM() {

  const acts =
    state.plannedActivities ||
    [];

  const info =
    new Map();

  const order =
    [];

  const visiting =
    new Set();

  const visited =
    new Set();


  function depsOf(
    activity
  ) {

    return v5GetDependencies(
      activity
    );
  }


  function weight(
    predecessor,
    successor,
    type
  ) {

    const t =
      String(
        type ||
        "FS"
      ).toUpperCase();

    const predDuration =
      Math.max(
        1,
        Number(
          predecessor.duration
        ) || 1
      );

    const succDuration =
      Math.max(
        1,
        Number(
          successor.duration
        ) || 1
      );

    if (
      t === "SS"
    ) {
      return 0;
    }

    if (
      t === "FF"
    ) {
      return (
        predDuration -
        succDuration
      );
    }

    return predDuration;
  }


  function visit(
    activity
  ) {

    const id =
      String(
        activity.id
      );

    if (
      visited.has(id)
    ) {
      return;
    }

    if (
      visiting.has(id)
    ) {
      return;
    }

    visiting.add(id);

    depsOf(
      activity
    ).forEach(
      dep => {

        const predecessor =
          acts.find(
            x =>
              String(x.id) ===
              String(dep.id)
          );

        if (
          predecessor
        ) {
          visit(
            predecessor
          );
        }
      }
    );

    visiting.delete(id);

    visited.add(id);

    order.push(
      activity
    );
  }


  acts.forEach(
    visit
  );


  acts.forEach(
    activity => {

      info.set(
        String(
          activity.id
        ),
        {
          es: 0,
          ef: Math.max(
            1,
            Number(
              activity.duration
            ) || 1
          ),
          ls: 0,
          lf: 0,
          slack: 0,
          critical: false
        }
      );
    }
  );


  order.forEach(
    activity => {

      const x =
        info.get(
          String(
            activity.id
          )
        );

      let es =
        0;

      depsOf(
        activity
      ).forEach(
        dep => {

          const predecessor =
            acts.find(
              item =>
                String(item.id) ===
                String(dep.id)
            );

          if (
            !predecessor
          ) {
            return;
          }

          const px =
            info.get(
              String(
                predecessor.id
              )
            );

          es =
            Math.max(
              es,
              px.es +
              weight(
                predecessor,
                activity,
                dep.type
              )
            );
        }
      );

      x.es =
        es;

      x.ef =
        es +
        Math.max(
          1,
          Number(
            activity.duration
          ) || 1
        );
    }
  );


  const projectEnd =
    Math.max(
      0,
      ...Array.from(
        info.values()
      ).map(
        x => x.ef
      )
    );


  const successors =
    new Map(
      acts.map(
        activity => [
          String(
            activity.id
          ),
          []
        ]
      )
    );


  acts.forEach(
    activity => {

      depsOf(
        activity
      ).forEach(
        dep => {

          const list =
            successors.get(
              String(
                dep.id
              )
            );

          if (list) {

            list.push(
              {
                activity,
                type:
                  dep.type
              }
            );
          }
        }
      );
    }
  );


  order
    .slice()
    .reverse()
    .forEach(
      activity => {

        const x =
          info.get(
            String(
              activity.id
            )
          );

        const succ =
          successors.get(
            String(
              activity.id
            )
          ) ||
          [];

        if (
          !succ.length
        ) {

          x.lf =
            projectEnd;

          x.ls =
            x.lf -
            Math.max(
              1,
              Number(
                activity.duration
              ) || 1
            );

        } else {

          x.ls =
            Math.min(
              ...succ.map(
                link =>
                  info.get(
                    String(
                      link.activity.id
                    )
                  ).ls -
                  weight(
                    activity,
                    link.activity,
                    link.type
                  )
              )
            );

          x.lf =
            x.ls +
            Math.max(
              1,
              Number(
                activity.duration
              ) || 1
            );
        }

        x.slack =
          x.ls -
          x.es;

        x.critical =
          x.slack <= 0;
      }
    );


  return {
    info,
    projectEnd
  };
}


/* =========================================================
   CRONOGRAMA DE DEPENDENCIAS
========================================================= */

function renderDependencyScheme() {

  const container =
    $("dependencyScheme");

  if (!container) {
    return;
  }

  const activities =
    state.plannedActivities ||
    [];

  if (
    !activities.length
  ) {

    container.innerHTML =
      `<div class="visual-empty">
        <span>01</span>
        <strong>Todavía no hay actividades planificadas</strong>
        <p>Agrega una actividad para comenzar.</p>
      </div>`;

    return;
  }


  container.innerHTML =
    activities
      .map(
        (activity, index) => {

          const deps =
            v5GetDependencies(
              activity
            );

          const depText =
            deps.length
              ? deps
                  .map(
                    dep => {

                      const found =
                        activities.find(
                          item =>
                            String(item.id) ===
                            String(dep.id)
                        );

                      return found
                        ? `${found.name} (${dep.type})`
                        : `${dep.id} (${dep.type})`;
                    }
                  )
                  .join(" · ")
              : "Inicio del proyecto";


          return `
            <div class="dependency-node">

              <div class="dependency-number">
                ${String(
                  index + 1
                ).padStart(
                  2,
                  "0"
                )}
              </div>

              <div class="dependency-body">

                <div class="dependency-top">

                  <strong>
                    ${escapeHTML(
                      activity.name
                    )}
                  </strong>

                  <span
                    style="
                      display:flex;
                      gap:5px;
                      align-items:center
                    "
                  >
                    <button
                      type="button"
                      class="orbe-edit-plan"
                      data-edit-plan="${escapeHTML(
                        activity.id
                      )}"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      data-delete-plan="${escapeHTML(
                        activity.id
                      )}"
                    >
                      ×
                    </button>
                  </span>

                </div>

                <span>
                  ${escapeHTML(
                    activity.phase ||
                    "Sin fase"
                  )}
                  ·
                  ${escapeHTML(
                    formatCompact(
                      activity.quantity
                    )
                  )}
                  ${escapeHTML(
                    activity.unit ||
                    ""
                  )}
                </span>

                <small>
                  Depende de:
                  ${escapeHTML(
                    depText
                  )}
                </small>

              </div>

            </div>
          `;
        }
      )
      .join("");


  container
    .querySelectorAll(
      "[data-delete-plan]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            removePlannerActivity(
              button.dataset.deletePlan
            )
        );
      }
    );


  container
    .querySelectorAll(
      "[data-edit-plan]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            beginEditPlannerActivity(
              button.dataset.editPlan
            )
        );
      }
    );
}


/* =========================================================
   NORMALIZAR LO YA CARGADO
========================================================= */

state.allPlans =
  (
    state.allPlans ||
    []
  ).map(
    v5NormalizeExistingPlan
  );

state.plannedActivities =
  (
    state.plannedActivities ||
    []
  ).map(
    v5NormalizeExistingPlan
  );

ensureDependencyPicker();

populateDependencies();
})();

/* =========================================================
   V4 FINAL — RENDER FINAL OVERRIDES
========================================================= */
(function(){
  const originalRenderAll = window.renderAllPlannerViews || (typeof renderAllPlannerViews === "function" ? renderAllPlannerViews : null);
  const originalDependency = window.renderDependencyScheme || (typeof renderDependencyScheme === "function" ? renderDependencyScheme : null);

  function enhanceDependencyButtons(){
    const box=document.getElementById("dependencyScheme");
    if(!box)return;
    box.querySelectorAll("[data-delete-plan]").forEach(btn=>{
      if(btn.parentNode?.querySelector("[data-edit-plan]"))return;
      const edit=document.createElement("button");
      edit.type="button";
      edit.className="orbe-edit-plan";
      edit.dataset.editPlan=btn.dataset.deletePlan;
      edit.textContent="Editar";
      btn.parentNode?.insertBefore(edit,btn);
      edit.addEventListener("click",()=>window.OrbePlanner?.editActivity?.(edit.dataset.editPlan));
    });
  }

  if(originalRenderAll){
    window.renderAllPlannerViews=function(){
      originalRenderAll();
      enhanceDependencyButtons();
      if(typeof renderCriticalPath === "function")renderCriticalPath();
    };
  }

  setTimeout(enhanceDependencyButtons,50);
  setTimeout(enhanceDependencyButtons,1000);
})();

/* =========================================================
   EXTENSIÓN: ACTIVIDADES ESCRITAS MANUALMENTE
   Conserva el selector y la lógica existente del catálogo.
========================================================= */

(function () {
  "use strict";

  function addManualPlannerActivity() {
    const name = document
      .getElementById("plannerActivityManual")
      ?.value.trim();

    const durationInput = document.getElementById(
      "plannerDuration"
    );

    const addButton = document.getElementById(
      "addPlannerActivity"
    );

    if (!name) return false;

    // Por ahora, el editor existente sigue gestionando
    // las actividades que ya están en el catálogo.
    if (window.OrbePlanner &&
        window.OrbePlanner.editActivity &&
        document.getElementById("cancelEditPlannerActivity")) {
      alert(
        "Para editar una actividad existente, " +
        "usa el selector del catálogo. " +
        "La edición de actividades manuales se integrará después."
      );
      return true;
    }

    const duration = Number(durationInput?.value);

    if (!Number.isFinite(duration) || duration <= 0) {
      alert(
        "Esta actividad no tiene un rendimiento registrado. " +
        "Introduce una duración mayor que cero."
      );
      durationInput?.focus();
      return true;
    }

    if (!state.selectedEmployees.length) {
      alert(
        "Selecciona al menos un empleado para formar el equipo."
      );
      return true;
    }

    // Obtener las dependencias seleccionadas en el formulario.
    const dependencyLinks = getDependencyLinks();

    const days = Math.max(1, Math.ceil(duration));

    const start = v5CalculateStartForDependencies(
      days,
      dependencyLinks
    );

    const end = addWorkDays(start, days - 1);

    if (
      state.currentProject &&
      !validateProjectEnd(end)
    ) {
      alert(getProjectEndMessage(end));
      return true;
    }

    if (
      state.currentProject &&
      alertBusyEmployees(start, end, "")
    ) {
      return true;
    }

    const planned = {
      id: `LOCAL-MANUAL-${Date.now()}`,
      sheetId: "",
      projectId: state.currentProject?.id || "",

      // No pertenece al catálogo de Google Sheets.
      activityId: "",

      phase: document.getElementById("plannerPhase")?.value || "",
      subarea: "",
      name: name,

      quantity: 0,
      unit: "",

      manager:
        document.getElementById("plannerManager")?.value || "",

      start: start,
      end: end,
      duration: days,

      dependencyId: dependencyLinks[0]?.id || null,
      dependencyType: dependencyLinks[0]?.type || "FS",
      dependencies: dependencyLinks,

      dependencyName: "",

      employees: getSelectedEmployees(),

      // No inventamos un rendimiento.
      yield: 0,
      yieldUnit: "",

      shift:
        document.getElementById("plannerShift")?.value ||
        "Diurno",

      status: "Pendiente"
    };

    state.plannedActivities.push(planned);

    v5SetDependencies(planned, dependencyLinks);

    recalculateAllDates();

    populateDependencies();
    renderAllPlannerViews();

    // Limpiar formulario sin alterar el catálogo.
    clearActivityForm(true);

    const manualInput = document.getElementById(
      "plannerActivityManual"
    );

    if (manualInput) manualInput.value = "";

    if (addButton) {
      addButton.textContent = "+ Agregar actividad";
    }

    return true;
  }

  function bindManualActivityInput() {
    const button = document.getElementById(
      "addPlannerActivity"
    );

    if (!button || button.dataset.manualActivityBound) {
      return;
    }

    button.dataset.manualActivityBound = "true";

    // Se ejecuta antes de los eventos existentes del botón.
    button.addEventListener(
      "click",
      function (event) {
        const manualInput = document.getElementById(
          "plannerActivityManual"
        );

        if (!manualInput?.value.trim()) {
          // Si no hay texto manual, se conserva el
          // comportamiento original del selector.
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        try {
          addManualPlannerActivity();
        } catch (error) {
          console.error(
            "Error al agregar actividad manual:",
            error
          );

          alert(
            "No se pudo agregar la actividad: " +
            error.message
          );
        }
      },
      true
    );
  }

  bindManualActivityInput();

  // Permite instalar la extensión si el botón se recrea.
  window.addEventListener("load", bindManualActivityInput);
})();
