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
    "https://script.google.com/macros/s/AKfycbzQp5bAz8gyBzPGQudNJA2LdoZ9NB7VDMWXsF9c7KJ1BNFG7j-QAjRdu1XVmD-lNkqcLA/exec",

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
  const n = Number(value);
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
  if (!value) {
    return null;
  }

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );
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

  const team =
    raw.EQUIPO ??
    raw.equipo ??
    "";

  const employeeIds =
    Array.isArray(team)
      ? team.map(String).filter(Boolean)
      : String(team)
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);

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

    dependencyId:
      raw.DEPENDENCIA ??
      raw.dependencyId ??
      "",

    employees:
      employeeIds,

    status:
      raw.ESTADO ??
      raw.status ??
      "Pendiente"
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
    normalize(
      activity.name
    );


  let match =
    state.yields.find(
      item =>
        unitsMatch(
          item.unit,
          activity.unit
        ) &&
        normalize(
          item.activity
        ) ===
        activityName
    );


  if (match) {
    return match;
  }


  match =
    state.yields.find(
      item => {

        if (
          !unitsMatch(
            item.unit,
            activity.unit
          )
        ) {
          return false;
        }

        const yieldName =
          normalize(
            item.activity
          );

        return (
          activityName.includes(
            yieldName
          ) ||
          yieldName.includes(
            activityName
          )
        );
      }
    );


  if (match) {
    return match;
  }


  const words =
    activityName
      .split(" ")
      .filter(
        word =>
          word.length >= 4
      );


  return (
    state.yields.find(
      item =>
        unitsMatch(
          item.unit,
          activity.unit
        ) &&
        words.some(
          word =>
            normalize(
              item.activity
            ).includes(word)
        )
    ) ||
    null
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


function renderEmployeeSelector() {

  const container =
    $("plannerEmployees");

  if (!container) {
    return;
  }


  container.innerHTML = "";


  const toolbar =
    document.createElement(
      "div"
    );

  toolbar.className =
    "employee-selector-toolbar";


  toolbar.innerHTML = `

    <span>
      ${state.selectedEmployees.length}
      seleccionado(s)
    </span>

    <button
      type="button"
      id="selectAllEmployees"
    >
      Seleccionar todos
    </button>

    <button
      type="button"
      id="clearAllEmployees"
    >
      Limpiar
    </button>
  `;


  container.appendChild(
    toolbar
  );


  const list =
    document.createElement(
      "div"
    );

  list.className =
    "employee-list";


  if (
    !state.employees.length
  ) {

    list.innerHTML =
      `<span class="empty-selection">
        No hay empleados cargados.
      </span>`;

    container.appendChild(
      list
    );

    return;
  }


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


      checkbox.checked =
        state.selectedEmployees.some(
          item =>
            String(
              item.id
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

            const exists =
              state.selectedEmployees.some(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    employee.id
                  )
              );


            if (!exists) {

              state.selectedEmployees.push(
                employee
              );
            }

          } else {

            state.selectedEmployees =
              state.selectedEmployees.filter(
                item =>
                  String(
                    item.id
                  ) !==
                  String(
                    employee.id
                  )
              );
          }


          renderEmployeeSelector();

          calculatePlannerRequirement();
        }
      );


      const text =
        document.createElement(
          "span"
        );


      text.innerHTML =
        `
          <strong>
            ${escapeHTML(
              employee.name
            )}
          </strong>

          <small>
            ${escapeHTML(
              employee.trade ||
              employee.role ||
              "Sin oficio"
            )}
          </small>
        `;


      label.appendChild(
        checkbox
      );

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


  $("selectAllEmployees")
    ?.addEventListener(
      "click",
      () => {

        state.selectedEmployees =
          state.employees.map(
            employee => ({
              ...employee
            })
          );

        renderEmployeeSelector();

        calculatePlannerRequirement();
      }
    );


  $("clearAllEmployees")
    ?.addEventListener(
      "click",
      () => {

        state.selectedEmployees =
          [];

        renderEmployeeSelector();

        calculatePlannerRequirement();
      }
    );
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

    return raw * 7;
  }


  if (
    unit === "horas"
  ) {

    return (
      raw /
      (
        shift === "Nocturno"
          ? 7
          : 8
      )
    );
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
    findYield(
      activity
    );


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


    info.textContent =
      `Necesitas al menos ${needed} empleado(s) para completar la actividad en ${formatCompact(
        enteredDays
      )} día(s).`;

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


    info.textContent =
      `Con: ${state.selectedEmployees.length} personas · duración estimada ${Math.max(
        1,
        Math.ceil(duration)
      )} día(s).`;

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

function injectShiftControl() {

  if ($("plannerShift")) {
    return;
  }


  const durationField =
    $("plannerDuration")
      ?.closest(".field");


  if (!durationField) {
    return;
  }


  const field =
    document.createElement(
      "label"
    );


  field.className =
    "field";


  field.innerHTML = `

    <span>
      Turno
    </span>

    <div
      class="shift-control"
    >

      <button
        type="button"
        class="shift-option active"
        data-shift="Diurno"
      >
        ☀️ Diurno
      </button>

      <button
        type="button"
        class="shift-option"
        data-shift="Nocturno"
      >
        🌙 Nocturno
      </button>

    </div>

    <input
      id="plannerShift"
      type="hidden"
      value="Diurno"
    >
  `;


  durationField.parentNode.insertBefore(
    field,
    durationField.nextSibling
  );


  field
    .querySelectorAll(
      ".shift-option"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            field
              .querySelectorAll(
                ".shift-option"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );

            button.classList.add(
              "active"
            );

            $("plannerShift").value =
              button.dataset.shift;
          }
        );
      }
    );
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


  return parseDate(
    state.currentProject?.start ||
    CONFIG.projectStart
  );
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

  if (
    !state.currentProject
  ) {

    openProjectGate();

    alert(
      "Primero crea o abre un proyecto."
    );

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
    !recommendation ||
    !recommendation.yield
  ) {

    alert(
      "Esta actividad no tiene rendimiento registrado."
    );

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


  if (
    durationDays <= 0
  ) {

    alert(
      "No se pudo calcular una duración válida."
    );

    return;
  }


  const start =
    calculateStartDate();


  const end =
    addDays(
      start,
      Math.max(
        1,
        Math.ceil(
          durationDays
        )
      ) - 1
    );


  const dependency =
    getDependency();


  const planned = {

    id:
      `LOCAL-${Date.now()}`,

    sheetId:
      "",

    projectId:
      state.currentProject.id,

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

    duration:
      Math.max(
        1,
        Math.ceil(
          durationDays
        )
      ),

    dependencyId:
      dependency?.id ||
      null,

    dependencyName:
      dependency?.name ||
      "",

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


  const button =
    $("addPlannerActivity");


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Guardando…";
  }


  try {

    await savePlan(
      planned
    );


    state.plannedActivities.push(
      planned
    );


    populateDependencies();

    renderAllPlannerViews();

    clearActivityForm(
      false
    );


  } catch (error) {

    console.error(error);

    alert(
      "No se pudo guardar la actividad:\n\n" +
      error.message
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "+ Agregar actividad";
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


    for (
      const item of affected
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


  } catch (error) {

    console.error(error);

    alert(
      "No se pudo eliminar la actividad:\n\n" +
      error.message
    );
  }
}


function recalculateAllDates() {

  state.plannedActivities.forEach(
    activity => {

      let start =
        parseDate(
          state.currentProject?.start ||
          CONFIG.projectStart
        );


      if (
        activity.dependencyId
      ) {

        const dependency =
          state.plannedActivities.find(
            item =>
              String(
                item.id
              ) ===
              String(
                activity.dependencyId
              )
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
          Math.max(
            1,
            activity.duration
          ) - 1
        );
    }
  );
}


/* =========================================================
   DEPENDENCIAS VISUALES
========================================================= */

function renderDependencyScheme() {

  const container =
    $("dependencyScheme");

  if (!container) {
    return;
  }


  if (
    !state.plannedActivities.length
  ) {

    container.innerHTML =
      `
        <div class="visual-empty">

          <span>
            01
          </span>

          <strong>
            Todavía no hay actividades planificadas
          </strong>

          <p>
            Agrega una actividad para comenzar.
          </p>

        </div>
      `;

    return;
  }


  container.innerHTML =
    state.plannedActivities
      .map(
        (activity, index) => {

          const dependency =
            activity.dependencyName ||
            "Inicio del proyecto";


          return `

            <div
              class="dependency-node"
            >

              <div
                class="dependency-number"
              >
                ${String(
                  index + 1
                ).padStart(
                  2,
                  "0"
                )}
              </div>


              <div
                class="dependency-body"
              >

                <div
                  class="dependency-top"
                >

                  <strong>
                    ${escapeHTML(
                      activity.name
                    )}
                  </strong>


                  <button
                    type="button"
                    data-delete-plan="${escapeHTML(
                      activity.id
                    )}"
                  >
                    ×
                  </button>

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
                    activity.unit
                  )}
                </span>


                <small>
                  Depende de:
                  ${escapeHTML(
                    dependency
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
      daysBetween(
        minDate,
        maxDate
      )
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
          addDays(
            minDate,
            index * unit
          );


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
              daysBetween(
                minDate,
                item.start
              ) - 1
            );


          const span =
            Math.max(
              1,
              daysBetween(
                item.start,
                item.end
              )
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


function mountProjectGate() {

  if (
    $("projectGate")
  ) {

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

              enterProject(
                project
              );
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


    enterProject(
      project
    );


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
          "",

        name:
          item.name,

        quantity:
          item.quantity,

        unit:
          item.unit,

        manager:
          "",

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

  window.print();
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


  $("addPlannerActivity")
    ?.addEventListener(
      "click",
      addPlannerActivity
    );


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
          () =>
            showView(
              button.dataset.view
            )
        );
      }
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
