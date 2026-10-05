/* =========================================================
   ORBE C FILMS — PLANIFICADOR DE OBRA
   V2
========================================================= */

"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const CONFIG = {
  sheetsUrl:
    "https://script.google.com/macros/s/AKfycbylNf8xOKe41ANhynste02e1YwPgFcQhXR_yTC7BPnKi_bGw0orM7oJhuadP2_Zvs1ktQ/exec",

  projectStart: "2026-10-16"
};


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const state = {
  activities: [],
  employees: [],
  yields: [],
  organizer: [],

  plannedActivities: [],

  selectedEmployees: [],

  currentView: "weeks",

  nextId: 1,

  connected: false
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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString("es-SV", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}


function formatCompact(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "";

  if (Number.isInteger(n)) {
    return String(n);
  }

  return n
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}


function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function dateOnly(date) {
  const d = new Date(date);

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );
}


function parseDate(value) {
  if (!value) return null;

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return dateOnly(d);
}


function formatDate(date) {
  const d = parseDate(date);

  if (!d) return "—";

  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function formatDateShort(date) {
  const d = parseDate(date);

  if (!d) return "—";

  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "2-digit"
  });
}


function addDays(date, amount) {
  const d = parseDate(date);

  if (!d) return null;

  d.setDate(d.getDate() + amount);

  return d;
}


function daysBetween(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);

  if (!a || !b) return 0;

  return Math.floor(
    (b - a) / 86400000
  ) + 1;
}


function startOfWeek(date) {
  const d = parseDate(date);

  if (!d) return null;

  const day = d.getDay();

  const diff = day === 0 ? -6 : 1 - day;

  return addDays(d, diff);
}


/* =========================================================
   NORMALIZACIÓN DE UNIDADES
========================================================= */

function normalizeUnit(value = "") {
  return normalize(value)
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/\./g, "")
    .replace(/\s+/g, "");
}


function unitsMatch(a, b) {
  const x = normalizeUnit(a);
  const y = normalizeUnit(b);

  if (x === y) return true;

  const aliases = {
    "m2": ["m2", "m²", "metrocuadrado", "metroscuadrados"],
    "m3": ["m3", "m³", "metrocubico", "metroscubicos"],
    "ml": ["ml", "mlineal", "mlineales"],
    "c/u": ["c/u", "cu", "un", "unidad", "unidades"],
    "sg": ["sg", "sumaglobal"]
  };

  for (const key of Object.keys(aliases)) {
    const list = aliases[key].map(normalizeUnit);

    if (
      list.includes(x) &&
      list.includes(y)
    ) {
      return true;
    }
  }

  return false;
}


/* =========================================================
   SHEETS — JSONP
========================================================= */

function loadJSONP(url) {
  return new Promise((resolve, reject) => {

    const callbackName =
      `orbePlanner_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;

    const script =
      document.createElement("script");

    let finished = false;

    const timeout = setTimeout(() => {
      finish();

      reject(
        new Error(
          "Tiempo de espera agotado al conectar con Google Sheets."
        )
      );
    }, 15000);


    function finish() {
      if (finished) return;

      finished = true;

      clearTimeout(timeout);

      delete window[callbackName];

      script.remove();
    }


    window[callbackName] = data => {

      finish();

      if (data?.ok === false) {
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


    const separator =
      url.includes("?")
        ? "&"
        : "?";


    script.src =
      `${url}${separator}callback=${callbackName}`;


    document.body.appendChild(script);
  });
}


/* =========================================================
   INTERPRETAR RESPUESTA DEL WEB APP
========================================================= */

function getSheetArray(data, names = []) {

  if (!data || typeof data !== "object") {
    return [];
  }


  for (const name of names) {

    if (Array.isArray(data[name])) {
      return data[name];
    }
  }


  return [];
}


/* =========================================================
   NORMALIZAR ACTIVIDADES
   HOJA: ACTIVIDADES DE OBRA
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
      raw.frente ??
      raw.fase ??
      raw.FASE ??
      "",

    subarea:
      raw["Subárea"] ??
      raw["SUBÁREA"] ??
      raw.subarea ??
      "",

    name:
      raw["ACTIVIDAD PARA PLANIFICACIÓN"] ??
      raw["Actividad"] ??
      raw.actividad ??
      raw.ACTIVIDAD ??
      "",

    quantity:
      number(
        raw["Cantidad"] ??
        raw.cantidad ??
        raw.CANTIDAD
      ),

    unit:
      raw["Unidad"] ??
      raw.unidad ??
      raw.UNIDAD ??
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
      raw["Criterio"] ??
      raw.criterio ??
      "",

    sourceRow:
      raw["Fila origen"] ??
      raw.fila ??
      ""
  };
}


/* =========================================================
   NORMALIZAR EMPLEADOS
   HOJA: EMPLEADOS
========================================================= */

function normalizeEmployee(raw) {

  return {
    id:
      raw.ID ??
      raw.id ??
      "",

    name:
      raw.NOMBRE ??
      raw.nombre ??
      raw.Nombre ??
      "",

    trade:
      raw.OFICIO ??
      raw.oficio ??
      raw.Oficio ??
      "",

    role:
      raw.ROL ??
      raw.rol ??
      raw.Rol ??
      ""
  };
}


/* =========================================================
   NORMALIZAR RENDIMIENTOS
   HOJA: RENDIMIENTOS
========================================================= */

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


/* =========================================================
   NORMALIZAR ORGANIZADOR
   HOJA: ORGANIZADOR
========================================================= */

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


/* =========================================================
   CARGAR TODO GOOGLE SHEETS
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


    /*
     * El backend puede entregar las hojas
     * con diferentes nombres.
     */

    const activitiesRaw =
      getSheetArray(data, [
        "activities",
        "actividades",
        "ACTIVIDADES DE OBRA",
        "items"
      ]);


    const employeesRaw =
      getSheetArray(data, [
        "employees",
        "empleados",
        "EMPLEADOS"
      ]);


    const yieldsRaw =
      getSheetArray(data, [
        "yields",
        "rendimientos",
        "RENDIMIENTOS"
      ]);


    const organizerRaw =
      getSheetArray(data, [
        "organizer",
        "organizador",
        "ORGANIZADOR"
      ]);


    state.activities =
      activitiesRaw
        .map(normalizeActivity)
        .filter(item =>
          item.name
        );


    state.employees =
      employeesRaw
        .map(normalizeEmployee)
        .filter(item =>
          item.name
        );


    state.yields =
      yieldsRaw
        .map(normalizeYield)
        .filter(item =>
          item.activity
        );


    state.organizer =
      organizerRaw
        .map(normalizeOrganizer);


    state.connected = true;


    populateActivities();

    populateManagers();

    renderEmployeeSelector();

    renderActivityInfo();

    setConnection(
      "Google Sheets conectado",
      "ok"
    );


    updateCounts();


  } catch (error) {

    console.error(error);

    state.connected = false;

    setConnection(
      "Error de conexión",
      "error"
    );

    console.error(
      "Detalle:",
      error.message
    );
  }
}


/* =========================================================
   ESTADO DE CONEXIÓN
========================================================= */

function setConnection(text, status) {

  const possibleIds = [
    "connectionText",
    "status",
    "sheetStatusText"
  ];


  possibleIds.forEach(id => {

    const el = $(id);

    if (!el) return;

    el.textContent = text;

    el.classList.remove(
      "ok",
      "error",
      "loading"
    );

    if (status) {
      el.classList.add(status);
    }
  });
}


/* =========================================================
   CONTADORES
========================================================= */

function updateCounts() {

  const navCount =
    $("navCount");

  if (navCount) {
    navCount.textContent =
      state.activities.length;
  }


  const status =
    $("sheetStatusText");

  if (status) {

    status.textContent =
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

  if (!select) return;


  select.innerHTML =
    `<option value="">
      Selecciona una actividad…
    </option>`;


  let previousPhase = "";


  state.activities.forEach((activity, index) => {

    const phase =
      activity.phase ||
      "Sin fase";


    if (phase !== previousPhase) {

      const group =
        document.createElement(
          "optgroup"
        );

      group.label = phase;

      select.appendChild(group);

      previousPhase = phase;
    }


    const group =
      [...select.children]
        .find(
          element =>
            element.tagName === "OPTGROUP" &&
            element.label === phase
        );


    const option =
      document.createElement("option");


    option.value = index;


    option.textContent =
      `${activity.name} · ` +
      `${formatCompact(activity.quantity)} ` +
      `${activity.unit}`;


    group.appendChild(option);
  });
}


/* =========================================================
   SELECCIONAR ACTIVIDAD
========================================================= */

function onActivitySelected() {

  const select =
    $("plannerActivity");

  if (!select) return;


  const index =
    Number(select.value);


  if (
    select.value === "" ||
    !Number.isInteger(index) ||
    !state.activities[index]
  ) {

    clearActivityForm();

    return;
  }


  const activity =
    state.activities[index];


  $("plannerPhase").value =
    activity.phase || "";


  /*
   * Cantidad no se muestra directamente
   * como input en la nueva interfaz.
   * Se guarda en la actividad seleccionada.
   */


  const dependency =
    $("plannerDependency");


  if (dependency) {
    dependency.value =
      "";
  }


  /*
   * Buscar rendimiento.
   */

  const recommendation =
    findYield(activity);


  renderActivityInfo(
    activity,
    recommendation
  );


  calculatePlannerRequirement();
}


/* =========================================================
   BUSCAR RENDIMIENTO
========================================================= */

function findYield(activity) {

  if (!activity) {
    return null;
  }


  const activityText =
    normalize(activity.name);


  /*
   * Primero coincidencia por actividad
   * + unidad.
   */

  let match =
    state.yields.find(y =>

      unitsMatch(
        y.unit,
        activity.unit
      ) &&

      normalize(y.activity) ===
      activityText
    );


  if (match) {
    return match;
  }


  /*
   * Después buscamos si el nombre
   * del rendimiento aparece dentro
   * del nombre de la actividad.
   */

  match =
    state.yields.find(y => {

      const yText =
        normalize(y.activity);

      return (
        unitsMatch(
          y.unit,
          activity.unit
        ) &&
        (
          activityText.includes(yText) ||
          yText.includes(activityText)
        )
      );
    });


  if (match) {
    return match;
  }


  /*
   * Finalmente coincidencia por palabras.
   */

  const words =
    activityText
      .split(" ")
      .filter(word =>
        word.length >= 4
      );


  match =
    state.yields.find(y => {

      if (
        !unitsMatch(
          y.unit,
          activity.unit
        )
      ) {
        return false;
      }


      const yText =
        normalize(y.activity);


      return words.some(
        word =>
          yText.includes(word)
      );
    });


  return match || null;
}


/* =========================================================
   INFORMACIÓN DE ACTIVIDAD
========================================================= */

function renderActivityInfo(
  activity = null,
  recommendation = null
) {

  const box =
    $("plannerActivityInfo");

  if (!box) return;


  if (!activity) {

    box.textContent =
      "Selecciona una actividad para cargar su cantidad, unidad y rendimiento.";

    return;
  }


  const quantity =
    formatCompact(
      activity.quantity
    );


  const unit =
    activity.unit ||
    "unidad";


  if (recommendation) {

    box.textContent =
      `${quantity} ${unit} · ` +
      `Rendimiento: ${formatCompact(
        recommendation.yield
      )} ${unit}/persona/día`;


  } else {

    box.textContent =
      `${quantity} ${unit} · ` +
      `Esta actividad todavía no tiene rendimiento registrado.`;
  }
}


/* =========================================================
   EMPLEADOS
========================================================= */

function renderEmployeeSelector() {

  const container =
    $("plannerEmployees");

  if (!container) return;


  /*
   * Si el HTML tiene un select,
   * lo utilizamos.
   */

  if (
    container.tagName === "SELECT"
  ) {

    container.innerHTML = "";


    state.employees.forEach(
      employee => {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          employee.id ||
          employee.name;

        option.textContent =
          employee.name +
          (
            employee.trade
              ? ` · ${employee.trade}`
              : ""
          );

        container.appendChild(
          option
        );
      }
    );


    return;
  }


  /*
   * Si es un contenedor,
   * generamos selector visual.
   */

  container.innerHTML = "";


  if (!state.employees.length) {

    container.innerHTML =
      `<span class="empty-selection">
        No hay empleados cargados.
      </span>`;

    return;
  }


  const list =
    document.createElement(
      "div"
    );

  list.className =
    "employee-list";


  state.employees.forEach(
    employee => {

      const label =
        document.createElement(
          "label"
        );

      label.className =
        "employee-option";


      const checkbox =
        document.createElement(
          "input"
        );

      checkbox.type =
        "checkbox";

      checkbox.value =
        employee.id ||
        employee.name;


      checkbox.checked =
        state.selectedEmployees.some(
          selected =>
            String(
              selected.id
            ) ===
            String(
              employee.id
            )
        );


      checkbox.addEventListener(
        "change",
        () => {

          if (
            checkbox.checked
          ) {

            if (
              !state.selectedEmployees.some(
                selected =>
                  String(selected.id) ===
                  String(employee.id)
              )
            ) {

              state.selectedEmployees.push(
                employee
              );
            }

          } else {

            state.selectedEmployees =
              state.selectedEmployees.filter(
                selected =>
                  String(selected.id) !==
                  String(employee.id)
              );
          }


          renderSelectedEmployeeChips();

          calculatePlannerRequirement();
        }
      );


      label.appendChild(
        checkbox
      );


      const text =
        document.createElement(
          "span"
        );

      text.textContent =
        employee.name;


      label.appendChild(
        text
      );


      list.appendChild(
        label
      );
    }
  );


  container.appendChild(
    list
  );


  renderSelectedEmployeeChips();
}


/* =========================================================
   CHIPS DE EMPLEADOS
========================================================= */

function renderSelectedEmployeeChips() {

  const container =
    $("plannerEmployees");

  if (!container) return;


  let chips =
    container.querySelector(
      ".selected-employees"
    );


  if (!chips) {

    chips =
      document.createElement(
        "div"
      );

    chips.className =
      "selected-employees";

    container.appendChild(
      chips
    );
  }


  chips.innerHTML = "";


  state.selectedEmployees.forEach(
    employee => {

      const chip =
        document.createElement(
          "span"
        );

      chip.className =
        "employee-chip";


      chip.textContent =
        employee.name;


      chips.appendChild(
        chip
      );
    }
  );
}


/* =========================================================
   ENCARGADOS
========================================================= */

function populateManagers() {

  const select =
    $("plannerManager");

  if (!select) return;


  select.innerHTML =
    `<option value="">
      Seleccionar encargado…
    </option>`;


  const managers =
    new Set();


  state.employees.forEach(
    employee => {

      if (
        employee.role
      ) {

        managers.add(
          employee.name
        );
      }
    }
  );


  state.organizer.forEach(
    row => {

      if (
        row.manager
      ) {

        managers.add(
          row.manager
        );
      }
    }
  );


  managers.forEach(
    manager => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        manager;

      option.textContent =
        manager;

      select.appendChild(
        option
      );
    }
  );
}


/* =========================================================
   REQUERIMIENTO DE EMPLEADOS
========================================================= */

function calculatePlannerRequirement() {

  const activityIndex =
    $("plannerActivity")?.value;


  const durationInput =
    $("plannerDuration");


  const requirement =
    $("employeeRequirement");


  if (
    activityIndex === "" ||
    !durationInput ||
    !requirement
  ) {

    if (requirement) {
      requirement.textContent = "";
    }

    return;
  }


  const activity =
    state.activities[
      Number(activityIndex)
    ];


  if (!activity) return;


  const recommendation =
    findYield(activity);


  if (!recommendation) {

    requirement.textContent =
      "No hay rendimiento registrado para esta actividad.";

    return;
  }


  const duration =
    number(
      durationInput.value
    );


  if (
    duration <= 0
  ) {

    requirement.textContent =
      "Ingresa la duración para calcular el equipo necesario.";

    return;
  }


  const efficiency = 1;


  const requiredPeople =
    Math.ceil(
      activity.quantity /
      (
        recommendation.yield *
        duration *
        efficiency
      )
    );


  requirement.textContent =
    `necesitas al menos ${requiredPeople} ` +
    `${
      requiredPeople === 1
        ? "empleado"
        : "empleados"
    } para completar esta actividad en ${duration} días.`;
}


/* =========================================================
   DURACIÓN AUTOMÁTICA
========================================================= */

function calculateDurationFromEmployees() {

  const activityIndex =
    $("plannerActivity")?.value;


  if (
    activityIndex === "" ||
    state.selectedEmployees.length === 0
  ) {
    return;
  }


  const activity =
    state.activities[
      Number(activityIndex)
    ];


  if (!activity) return;


  const recommendation =
    findYield(activity);


  if (!recommendation) return;


  const people =
    state.selectedEmployees.length;


  const duration =
    activity.quantity /
    (
      recommendation.yield *
      people
    );


  if (
    Number.isFinite(duration) &&
    duration > 0
  ) {

    const input =
      $("plannerDuration");

    if (input) {
      input.value =
        Math.ceil(duration);
    }
  }


  calculatePlannerRequirement();
}


/* =========================================================
   LIMPIAR ACTIVIDAD
========================================================= */

function clearActivityForm() {

  if ($("plannerPhase")) {
    $("plannerPhase").value = "";
  }


  if ($("plannerDependency")) {
    $("plannerDependency").value = "";
  }


  if ($("plannerDuration")) {
    $("plannerDuration").value = "";
  }


  if ($("plannerManager")) {
    $("plannerManager").value = "";
  }


  state.selectedEmployees = [];


  renderEmployeeSelector();

  renderActivityInfo();

  calculatePlannerRequirement();
}


/* =========================================================
   OBTENER EQUIPO
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


/* =========================================================
   DEPENDENCIA
========================================================= */

function getDependency() {

  const value =
    $("plannerDependency")?.value;

  if (!value) {
    return null;
  }


  const index =
    Number(value);


  return state.plannedActivities[index] ||
    null;
}


/* =========================================================
   POBLAR DEPENDENCIAS
========================================================= */

function populateDependencies() {

  const select =
    $("plannerDependency");

  if (!select) return;


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


/* =========================================================
   FECHA DE INICIO
========================================================= */

function calculateStartDate() {

  const dependency =
    getDependency();


  if (
    dependency &&
    dependency.end
  ) {

    return addDays(
      dependency.end,
      1
    );
  }


  /*
   * Si no depende de nada,
   * comienza desde el inicio
   * oficial del proyecto.
   */

  return parseDate(
    CONFIG.projectStart
  );
}


/* =========================================================
   AGREGAR ACTIVIDAD
========================================================= */

function addPlannerActivity() {

  const activityIndex =
    $("plannerActivity")?.value;


  if (
    activityIndex === "" ||
    activityIndex === undefined
  ) {

    alert(
      "Selecciona una actividad."
    );

    return;
  }


  const activity =
    state.activities[
      Number(activityIndex)
    ];


  if (!activity) {

    alert(
      "No se encontró la actividad."
    );

    return;
  }


  const duration =
    number(
      $("plannerDuration")?.value
    );


  if (
    duration <= 0
  ) {

    alert(
      "Ingresa una duración válida."
    );

    return;
  }


  if (
    state.selectedEmployees.length === 0
  ) {

    alert(
      "Selecciona al menos un empleado para formar el equipo."
    );

    return;
  }


  const recommendation =
    findYield(activity);


  const start =
    calculateStartDate();


  if (!start) {

    alert(
      "No se pudo determinar la fecha de inicio."
    );

    return;
  }


  const end =
    addDays(
      start,
      Math.ceil(duration) - 1
    );


  const manager =
    $("plannerManager")?.value ||
    "";


  const dependency =
    getDependency();


  const planned = {

    id:
      state.nextId++,

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

    manager,

    start,

    end,

    duration:
      Math.ceil(duration),

    dependencyId:
      dependency
        ? dependency.id
        : null,

    dependencyName:
      dependency
        ? dependency.name
        : "",

    employees:
      getSelectedEmployees(),

    yield:
      recommendation
        ? recommendation.yield
        : null,

    yieldUnit:
      recommendation
        ? recommendation.yieldUnit
        : ""
  };


  state.plannedActivities.push(
    planned
  );


  /*
   * Recalcular IDs visuales.
   */

  renderAllPlannerViews();


  /*
   * Preparar formulario para
   * siguiente actividad.
   */

  populateDependencies();


  /*
   * Mantener la actividad seleccionada
   * pero limpiar duración/equipo.
   */

  if ($("plannerDuration")) {
    $("plannerDuration").value = "";
  }


  state.selectedEmployees = [];

  renderEmployeeSelector();

  calculatePlannerRequirement();
}


/* =========================================================
   ELIMINAR ACTIVIDAD
========================================================= */

function removePlannerActivity(id) {

  const index =
    state.plannedActivities.findIndex(
      activity =>
        activity.id === id
    );


  if (index === -1) {
    return;
  }


  state.plannedActivities.splice(
    index,
    1
  );


  /*
   * Si otra actividad dependía
   * de esta, eliminamos la dependencia.
   */

  state.plannedActivities.forEach(
    activity => {

      if (
        activity.dependencyId === id
      ) {

        activity.dependencyId =
          null;

        activity.dependencyName =
          "";
      }
    }
  );


  recalculateAllDates();

  populateDependencies();

  renderAllPlannerViews();
}


/* =========================================================
   RECALCULAR FECHAS
========================================================= */

function recalculateAllDates() {

  state.plannedActivities.forEach(
    activity => {

      let start =
        parseDate(
          CONFIG.projectStart
        );


      if (
        activity.dependencyId
      ) {

        const dependency =
          state.plannedActivities.find(
            item =>
              item.id ===
              activity.dependencyId
          );


        if (
          dependency &&
          dependency.end
        ) {

          start =
            addDays(
              dependency.end,
              1
            );
        }
      }


      activity.start =
        start;


      activity.end =
        addDays(
          start,
          activity.duration - 1
        );
    }
  );
}


/* =========================================================
   RENDER TODO
========================================================= */

function renderAllPlannerViews() {

  renderDependencyScheme();

  renderGantt();

  renderMasterTable();

  renderPeriodFilter();
}


/* =========================================================
   ESQUEMA DE DEPENDENCIAS
========================================================= */

function renderDependencyScheme() {

  const container =
    $("dependencyScheme");

  if (!container) return;


  if (
    state.plannedActivities.length === 0
  ) {

    container.innerHTML =
      `
        <div class="visual-empty">

          <span>01</span>

          <strong>
            Todavía no hay actividades planificadas
          </strong>

          <p>
            Selecciona una actividad, asigna su
            equipo y duración para comenzar.
          </p>

        </div>
      `;

    return;
  }


  const roots =
    state.plannedActivities.filter(
      activity =>
        !activity.dependencyId
    );


  const html =
    roots
      .map(
        root =>
          renderDependencyNode(
            root,
            0
          )
      )
      .join("");


  container.innerHTML =
    html;
}


function renderDependencyNode(
  activity,
  level
) {

  const children =
    state.plannedActivities.filter(
      item =>
        item.dependencyId ===
        activity.id
    );


  const team =
    activity.employees
      .map(
        employee =>
          employee.name
      )
      .join(", ");


  const childHTML =
    children.length
      ? `
        <div class="dependency-branch">

          ${children
            .map(
              child =>
                renderDependencyNode(
                  child,
                  level + 1
                )
            )
            .join("")}

        </div>
      `
      : "";


  return `
    <div class="dependency-node">

      <div class="dependency-index">
        ${state.plannedActivities.indexOf(activity) + 1}
      </div>

      <div>

        <div class="dependency-content">

          <strong>
            ${escapeHTML(activity.name)}
          </strong>

          <div class="dependency-meta">

            <span>
              ${escapeHTML(activity.phase || "Sin fase")}
            </span>

            <span>
              ${formatDateShort(activity.start)}
              →
              ${formatDateShort(activity.end)}
            </span>

            <span>
              ${activity.duration} días
            </span>

            <span>
              ${escapeHTML(team || "Sin equipo")}
            </span>

          </div>

        </div>

        ${childHTML}

      </div>

    </div>
  `;
}


/* =========================================================
   CRONOGRAMA
========================================================= */

function renderGantt() {

  const container =
    $("ganttChart");

  if (!container) return;


  if (
    state.plannedActivities.length === 0
  ) {

    container.innerHTML =
      `
        <div class="visual-empty">

          <span>—</span>

          <strong>
            Cronograma vacío
          </strong>

          <p>
            Las barras aparecerán aquí
            conforme agregues actividades.
          </p>

        </div>
      `;

    return;
  }


  const minDate =
    state.plannedActivities.reduce(
      (min, activity) => {

        if (
          !min ||
          activity.start < min
        ) {
          return activity.start;
        }

        return min;
      },
      null
    );


  const maxDate =
    state.plannedActivities.reduce(
      (max, activity) => {

        if (
          !max ||
          activity.end > max
        ) {
          return activity.end;
        }

        return max;
      },
      null
    );


  const first =
    startOfWeek(minDate);


  const last =
    startOfWeek(maxDate);


  const weeks =
    Math.ceil(
      (
        last - first
      ) / (
        7 * 86400000
      )
    ) + 1;


  let periods = [];


  if (
    state.currentView === "days"
  ) {

    const totalDays =
      daysBetween(
        first,
        addDays(
          last,
          6
        )
      );


    for (
      let i = 0;
      i < totalDays;
      i++
    ) {

      periods.push(
        addDays(
          first,
          i
        )
      );
    }

  } else {

    for (
      let i = 0;
      i < weeks;
      i++
    ) {

      periods.push(
        addDays(
          first,
          i * 7
        )
      );
    }
  }


  const header =
    renderGanttHeader(
      periods,
      first,
      last
    );


  const rows =
    state.plannedActivities
      .map(
        activity =>
          renderGanttRow(
            activity,
            first,
            last,
            periods
          )
      )
      .join("");


  container.innerHTML =
    `
      <div class="gantt-inner">

        ${header}

        ${rows}

      </div>
    `;
}


function renderGanttHeader(
  periods,
  first,
  last
) {

  const cells =
    periods
      .map(period => {

        const label =
          state.currentView === "days"
            ? formatDateShort(period)
            : `SEM ${getWeekNumber(period)}`;

        return `
          <div class="gantt-period">
            ${label}
          </div>
        `;
      })
      .join("");


  return `
    <div class="gantt-header">

      <div class="gantt-label-header">
        ACTIVIDAD
      </div>

      <div
        class="gantt-time-header"
        style="
          grid-template-columns:
          repeat(${periods.length}, minmax(45px,1fr));
        "
      >
        ${cells}
      </div>

    </div>
  `;
}


function renderGanttRow(
  activity,
  first,
  last,
  periods
) {

  const totalDays =
    daysBetween(
      first,
      addDays(last, 6)
    );


  let startOffset =
    daysBetween(
      first,
      activity.start
    ) - 1;


  let duration =
    activity.duration;


  if (
    state.currentView === "days"
  ) {

    /*
     * 1 columna = 1 día
     */

  } else {

    /*
     * 1 columna = 7 días
     * pero la barra continúa
     * usando porcentaje real.
     */

  }


  const left =
    Math.max(
      0,
      (
        startOffset /
        totalDays
      ) * 100
    );


  const width =
    Math.max(
      1.5,
      (
        duration /
        totalDays
      ) * 100
    );


  const team =
    activity.employees
      .map(
        employee =>
          employee.name
      )
      .join(", ");


  const gridColumns =
    periods.length;


  return `
    <div class="gantt-row">

      <div class="gantt-row-label">

        <strong>
          ${escapeHTML(activity.name)}
        </strong>

        <span>
          ${formatDateShort(activity.start)}
          →
          ${formatDateShort(activity.end)}
        </span>

      </div>

      <div
        class="gantt-track"
        style="
          background-size:
          calc(100% / ${gridColumns}) 100%;
        "
      >

        <div
          class="gantt-bar"
          title="${escapeHTML(team)}"
          style="
            left:${left}%;
            width:${width}%;
          "
        >
          ${escapeHTML(
            activity.name
          )}
        </div>

      </div>

    </div>
  `;
}


function getWeekNumber(date) {

  const d =
    parseDate(date);

  if (!d) return "";

  const firstDay =
    new Date(
      d.getFullYear(),
      0,
      1
    );

  const dayOfYear =
    Math.floor(
      (
        d -
        firstDay
      ) /
      86400000
    ) + 1;


  return Math.ceil(
    dayOfYear / 7
  );
}


/* =========================================================
   TABLA MAESTRA
========================================================= */

function renderMasterTable() {

  const table =
    $("masterTable");

  if (!table) return;


  let tbody =
    table.querySelector(
      "tbody"
    );


  /*
   * Si masterTable es el tbody
   * directamente.
   */

  if (
    table.tagName === "TBODY"
  ) {

    tbody = table;
  }


  if (!tbody) {

    tbody =
      table.querySelector(
        "tbody"
      );
  }


  if (!tbody) return;


  const rows =
    getFilteredActivities();


  if (!rows.length) {

    tbody.innerHTML =
      `
        <tr>

          <td
            colspan="7"
            class="table-empty"
          >
            No hay actividades
            planificadas.

          </td>

        </tr>
      `;

    return;
  }


  tbody.innerHTML =
    rows
      .map(
        (activity, index) =>
          renderMasterRow(
            activity,
            index
          )
      )
      .join("");
}


function renderMasterRow(
  activity,
  index
) {

  const team =
    activity.employees
      .map(
        employee =>
          `
            <span>
              ${escapeHTML(
                employee.name
              )}
            </span>
          `
      )
      .join("");


  return `
    <tr>

      <td>
        ${index + 1}
      </td>

      <td>
        <b>
          ${escapeHTML(
            activity.phase ||
            "—"
          )}
        </b>
      </td>

      <td>
        ${escapeHTML(
          activity.name
        )}
      </td>

      <td>
        ${escapeHTML(
          activity.manager ||
          "—"
        )}
      </td>

      <td>
        ${formatDate(
          activity.start
        )}
      </td>

      <td>
        ${formatDate(
          activity.end
        )}
      </td>

      <td>

        <div class="table-team">

          ${
            team ||
            `<span>Sin equipo</span>`
          }

        </div>

      </td>

    </tr>
  `;
}


/* =========================================================
   FILTROS
========================================================= */

function getFilteredActivities() {

  let result =
    [...state.plannedActivities];


  const phase =
    $("filterPhase")?.value ||
    "";


  const manager =
    $("filterManager")?.value ||
    "";


  const employee =
    $("filterEmployee")?.value ||
    "";


  const period =
    $("filterPeriod")?.value ||
    "";


  if (phase) {

    result =
      result.filter(
        activity =>
          activity.phase ===
          phase
      );
  }


  if (manager) {

    result =
      result.filter(
        activity =>
          activity.manager ===
          manager
      );
  }


  if (employee) {

    result =
      result.filter(
        activity =>
          activity.employees.some(
            person =>
              String(person.id) ===
              String(employee)
          )
      );
  }


  if (period) {

    result =
      result.filter(
        activity =>
          activity.start <=
            parseDate(period) &&
          activity.end >=
            parseDate(period)
      );
  }


  return result;
}


/* =========================================================
   FILTRO — FASE
========================================================= */

function populatePhaseFilter() {

  const select =
    $("filterPhase");

  if (!select) return;


  const current =
    select.value;


  const phases =
    [
      ...new Set(
        state.plannedActivities
          .map(
            activity =>
              activity.phase
          )
          .filter(Boolean)
      )
    ];


  select.innerHTML =
    `
      <option value="">
        Todas las fases
      </option>
    `;


  phases.forEach(
    phase => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        phase;

      option.textContent =
        phase;

      select.appendChild(
        option
      );
    }
  );


  select.value =
    current;
}


/* =========================================================
   FILTRO — ENCARGADO
========================================================= */

function populateManagerFilter() {

  const select =
    $("filterManager");

  if (!select) return;


  const current =
    select.value;


  const managers =
    [
      ...new Set(
        state.plannedActivities
          .map(
            activity =>
              activity.manager
          )
          .filter(Boolean)
      )
    ];


  select.innerHTML =
    `
      <option value="">
        Todos los encargados
      </option>
    `;


  managers.forEach(
    manager => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        manager;

      option.textContent =
        manager;

      select.appendChild(
        option
      );
    }
  );


  select.value =
    current;
}


/* =========================================================
   FILTRO — EMPLEADO
========================================================= */

function populateEmployeeFilter() {

  const select =
    $("filterEmployee");

  if (!select) return;


  const current =
    select.value;


  select.innerHTML =
    `
      <option value="">
        Todos los empleados
      </option>
    `;


  state.employees.forEach(
    employee => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        employee.id ||
        employee.name;

      option.textContent =
        employee.name;

      select.appendChild(
        option
      );
    }
  );


  select.value =
    current;
}


/* =========================================================
   FILTRO — PERÍODO
========================================================= */

function renderPeriodFilter() {

  populatePhaseFilter();

  populateManagerFilter();

  populateEmployeeFilter();
}


/* =========================================================
   EXPORTAR TABLA
========================================================= */

function exportCSV() {

  const rows =
    getFilteredActivities();


  if (!rows.length) {

    alert(
      "No hay actividades para exportar."
    );

    return;
  }


  const header = [
    "#",
    "Fase",
    "Actividad",
    "Encargado",
    "Inicio",
    "Fin",
    "Equipo"
  ];


  const csvRows = [
    header
  ];


  rows.forEach(
    (activity, index) => {

      csvRows.push([
        index + 1,

        activity.phase,

        activity.name,

        activity.manager,

        formatDate(
          activity.start
        ),

        formatDate(
          activity.end
        ),

        activity.employees
          .map(
            employee =>
              employee.name
          )
          .join(" | ")
      ]);
    }
  );


  const csv =
    csvRows
      .map(
        row =>
          row
            .map(
              value =>
                `"${String(value)
                  .replace(/"/g, '""')}"`
            )
            .join(",")
      )
      .join("\n");


  const blob =
    new Blob(
      [
        "\ufeff" +
        csv
      ],
      {
        type:
          "text/csv;charset=utf-8;"
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
    "planificador_obra.csv";


  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}


/* =========================================================
   IMPRIMIR
========================================================= */

function printPlanner() {
  window.print();
}


/* =========================================================
   CAMBIAR VISTA GANTT
========================================================= */

function setGanttView(view) {

  if (
    view !== "days" &&
    view !== "weeks"
  ) {
    return;
  }


  state.currentView =
    view;


  document
    .querySelectorAll(
      ".view-btn"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.view ===
          view
        );
      }
    );


  renderGantt();
}


/* =========================================================
   NAVEGACIÓN
========================================================= */

function showView(viewName) {

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
   EVENTOS
========================================================= */

function bindEvents() {

  /*
   * ACTIVIDAD
   */

  $("plannerActivity")
    ?.addEventListener(
      "change",
      onActivitySelected
    );


  /*
   * DURACIÓN
   */

  $("plannerDuration")
    ?.addEventListener(
      "input",
      calculatePlannerRequirement
    );


  /*
   * AGREGAR
   */

  $("addPlannerActivity")
    ?.addEventListener(
      "click",
      addPlannerActivity
    );


  /*
   * LIMPIAR
   */

  $("clearPlannerActivity")
    ?.addEventListener(
      "click",
      clearActivityForm
    );


  /*
   * GANTT
   */

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
              button.dataset.view
            )
        );
      }
    );


  /*
   * NAVEGACIÓN
   */

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
          }
        );
      }
    );


  /*
   * FILTROS
   */

  [
    "filterPhase",
    "filterManager",
    "filterEmployee",
    "filterPeriod"
  ].forEach(
    id => {

      $(id)
        ?.addEventListener(
          "change",
          renderMasterTable
        );
    }
  );


  /*
   * EXPORTAR
   */

  $("exportTable")
    ?.addEventListener(
      "click",
      exportCSV
    );


  /*
   * IMPRIMIR
   */

  $("printTable")
    ?.addEventListener(
      "click",
      printPlanner
    );
}


/* =========================================================
   INICIALIZACIÓN
========================================================= */

function initialize() {

  console.log(
    "ORBE C Films — Planificador V2 iniciando..."
  );


  bindEvents();


  showView(
    "planificador"
  );


  renderActivityInfo();

  renderDependencyScheme();

  renderGantt();

  renderMasterTable();


  loadSheets();
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
