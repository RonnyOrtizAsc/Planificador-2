const $ = id => document.getElementById(id);

const state = {
  items: [],
  mode: "individual",
  presets: JSON.parse(
    localStorage.getItem("obra_presets") || "[]"
  )
};


/* =====================================================
   CONFIGURACIÓN GOOGLE SHEETS
   ===================================================== */

const GOOGLE_SHEET_ID =
  "1ToUC11fXj4k0xfMG6kad6CirbohvMkX6IT95nuaP_FE";

const GOOGLE_SHEET_NAME =
  "plandeoferta";


/* =====================================================
   UTILIDADES
   ===================================================== */

function n(id, fallback = 0) {

  const element = $(id);

  if (!element) {
    return fallback;
  }

  const value =
    parseFloat(element.value);

  return Number.isFinite(value)
    ? value
    : fallback;
}


function fmt(value, decimals = 2) {

  return Number(value).toLocaleString(
    "es-SV",
    {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }
  );

}


function unit() {

  return $("unit").value.trim() ||
    "unidad";

}


function resourceWord() {

  return state.mode === "individual"
    ? "personas"
    : "equipos";

}


function resourceSingular() {

  return state.mode === "individual"
    ? "persona"
    : "equipo";

}


/* =====================================================
   MODO INDIVIDUAL / EQUIPO
   ===================================================== */

function setMode(mode) {

  state.mode = mode;


  $("individualBtn")
    .classList
    .toggle(
      "selected",
      mode === "individual"
    );


  $("teamBtn")
    .classList
    .toggle(
      "selected",
      mode === "team"
    );


  $("peoplePerTeamWrap").hidden =
    mode !== "team";


  updateYieldLabel();

  calculate();

}


function updateYieldLabel() {

  $("yieldSuffix").textContent =
    `${unit()} / ${
      state.mode === "individual"
        ? "persona"
        : "equipo"
    } / día`;


  $("resourceLabel").textContent =
    resourceWord();


  $("resourceLabel2").textContent =
    resourceWord();

}


/* =====================================================
   CARGAR PARTIDAS EN EL SELECTOR
   ===================================================== */

function populate(items) {

  state.items =
    Array.isArray(items)
      ? items
      : [];


  const select =
    $("activitySelect");


  select.innerHTML =
    '<option value="">Sin actividad — prueba libre</option>';


  state.items.forEach(
    (item, index) => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        index;


      option.textContent =
        `${item.item || ""} — ${item.description || ""}` +
        `${
          item.quantity != null
            ? ` · ${fmt(item.quantity)} ${item.unit || ""}`
            : ""
        }`;


      select.appendChild(
        option
      );

    }
  );


  $("navCount").textContent =
    state.items.length;


  $("sheetStatusText").textContent =
    `${state.items.length} partidas disponibles.`;

}


/* =====================================================
   CARGAR ACTIVIDAD SELECCIONADA
   ===================================================== */

function loadActivity() {

  const value =
    $("activitySelect").value;


  if (value === "") {

    $("activityInfo").textContent =
      "Prueba libre: escribe cualquier cantidad, unidad y rendimiento.";

    return;

  }


  const item =
    state.items[
      Number(value)
    ];


  if (!item) {
    return;
  }


  $("quantity").value =
    item.quantity ?? "";


  $("unit").value =
    item.unit || "";


  $("activityInfo").textContent =
    `${
      item.section
        ? item.section + " · "
        : ""
    }Partida ${
      item.item || "—"
    } · ${
      item.description || ""
    }`;


  updateYieldLabel();

  calculate();

}


/* =====================================================
   CALCULADORA
   ===================================================== */

function calculate() {

  const Q =
    n("quantity");


  const R =
    n("yield");


  const E =
    Math.max(
      0.01,
      n("efficiency", 100)
    ) / 100;


  const targetDays =
    Math.max(
      0.01,
      n("targetDays", 1)
    );


  const resources =
    Math.max(
      1,
      n("resources", 1)
    );


  const targetResources =
    Math.max(
      1,
      n("resourcesTarget", 1)
    );


  const currentUnit =
    unit();


  const mode =
    state.mode;


  const resourceName =
    resourceWord();


  const resourceNameSingular =
    resourceSingular();


  const peoplePerTeam =
    Math.max(
      1,
      n("peoplePerTeam", 1)
    );


  /*
   * Si no existe una cantidad o rendimiento,
   * limpiamos los resultados.
   */

  if (
    Q <= 0 ||
    R <= 0
  ) {

    $("requiredResources").textContent =
      "—";


    $("calculatedDays").textContent =
      "—";


    $("requiredYield").textContent =
      "—";


    $("scenarioTable").innerHTML =
      "";


    return;

  }


  /*
   * PRODUCCIÓN DIARIA
   *
   * rendimiento × recursos × eficiencia
   */

  const dailyProduction =
    R *
    resources *
    E;


  /*
   * ESCENARIO 2
   *
   * ¿Cuántos días necesito?
   */

  const days =
    Q /
    dailyProduction;


  /*
   * ESCENARIO 1
   *
   * ¿Cuántos recursos necesito
   * para terminar en X días?
   */

  const rawRequired =
    Q /
    (
      R *
      targetDays *
      E
    );


  const required =
    Math.max(
      1,
      Math.ceil(rawRequired)
    );


  /*
   * ESCENARIO 3
   *
   * ¿Qué rendimiento necesito
   * con X recursos durante X días?
   */

  const requiredYield =
    Q /
    (
      targetResources *
      targetDays *
      E
    );


  /*
   * PERSONAS TOTALES CUANDO SE USA EQUIPO
   */

  const totalRequiredPeople =
    mode === "team"
      ? required *
        peoplePerTeam
      : required;


  const activePeople =
    mode === "team"
      ? resources *
        peoplePerTeam
      : resources;


  /* -----------------------------------------------
     RESULTADO 1
     ----------------------------------------------- */

  if (mode === "team") {

    $("requiredResources").textContent =
      `${required} equipos · ${totalRequiredPeople} pers.`;


    $("requiredDetail").textContent =
      `${fmt(rawRequired)} equipos → ` +
      `${required} equipos de ` +
      `${peoplePerTeam} personas`;

  } else {

    $("requiredResources").textContent =
      `${required} personas`;


    $("requiredDetail").textContent =
      `${fmt(rawRequired)} personas → ` +
      `redondeado a ${required}`;

  }


  /* -----------------------------------------------
     RESULTADO 2
     ----------------------------------------------- */

  $("calculatedDays").textContent =
    `${fmt(days)} días`;


  $("productionDetail").textContent =
    `Producción: ${fmt(
      dailyProduction
    )} ${currentUnit}/día` +
    (
      mode === "team"
        ? ` · ${activePeople} personas`
        : ""
    );


  /* -----------------------------------------------
     RESULTADO 3
     ----------------------------------------------- */

  $("requiredYield").textContent =
    `${fmt(requiredYield)} ` +
    `${currentUnit}/` +
    `${resourceNameSingular}/día`;


  /* =================================================
     TABLA DE COMPARACIÓN
     ================================================= */

  const rows = [];


  const start =
    Math.max(
      1,
      Math.floor(resources) - 2
    );


  const end =
    Math.floor(resources) + 2;


  for (
    let r = start;
    r <= end;
    r++
  ) {

    const production =
      R *
      r *
      E;


    const duration =
      Q /
      production;


    const difference =
      targetDays
        ? (
            (
              duration -
              targetDays
            ) /
            targetDays
          ) * 100
        : 0;


    let resourceText;


    if (mode === "team") {

      resourceText =
        `${r} equipos · ` +
        `${r * peoplePerTeam} pers.`;

    } else {

      resourceText =
        `${r} personas`;

    }


    rows.push(`
      <tr>

        <td>
          <b>${resourceText}</b>
        </td>

        <td>
          ${fmt(production)}
          ${currentUnit}/día
        </td>

        <td>
          <b>${fmt(duration)} días</b>
        </td>

        <td class="${
          duration <= targetDays
            ? "good"
            : "warn"
        }">

          ${
            duration <= targetDays
              ? "✓ Cumple"
              : `+${fmt(difference)}%`
          }

        </td>

      </tr>
    `);

  }


  $("scenarioTable").innerHTML =
    rows.join("");

}


/* =====================================================
   RENDIMIENTOS GUARDADOS
   ===================================================== */

function renderPresets() {

  const box =
    $("presetList");


  if (
    !state.presets.length
  ) {

    box.innerHTML = `
      <span class="muted">
        Todavía no hay rendimientos guardados.
        Guarda uno cuando encuentres un dato
        que quieras reutilizar.
      </span>
    `;


    return;

  }


  box.innerHTML =
    state.presets
      .map(
        (preset, index) => `

          <div class="preset">

            <span>

              <b>${preset.name}</b>

              ·

              ${fmt(preset.yield)}

              ${preset.unit}/

              ${
                preset.mode === "individual"
                  ? "persona"
                  : "equipo"
              }/día

            </span>


            <button
              data-preset="${index}">

              Usar

            </button>

          </div>

        `
      )
      .join("");


  box
    .querySelectorAll(
      "[data-preset]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            const preset =
              state.presets[
                Number(
                  button.dataset.preset
                )
              ];


            $("yield").value =
              preset.yield;


            $("unit").value =
              preset.unit;


            setMode(
              preset.mode
            );

          };

      }
    );

}


/* =====================================================
   GUARDAR RENDIMIENTO
   ===================================================== */

$("savePreset").onclick =
  () => {

    const selected =
      $("activitySelect")
        .selectedOptions[0];


    let defaultName =
      "Rendimiento personalizado";


    if (
      selected &&
      $("activitySelect").value !== ""
    ) {

      defaultName =
        selected.textContent
          .split("—")
          .slice(1)
          .join("—")
          .trim();

    }


    const name =
      prompt(
        "Nombre para este rendimiento:",
        defaultName
      );


    if (!name) {
      return;
    }


    state.presets.push({

      name,

      yield:
        n("yield"),

      unit:
        unit(),

      mode:
        state.mode

    });


    localStorage.setItem(
      "obra_presets",
      JSON.stringify(
        state.presets
      )
    );


    renderPresets();

  };


/* =====================================================
   GOOGLE SHEETS DIRECTO
   ===================================================== */

async function loadGoogleSheet() {

  $("status").textContent =
    "Cargando partidas desde Google Sheets…";


  $("status").className =
    "tiny-status";


  /*
   * Endpoint público de Google Visualization.
   *
   * No necesita Apps Script.
   */

  const url =
    `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq` +
    `?sheet=${encodeURIComponent(
      GOOGLE_SHEET_NAME
    )}` +
    `&tqx=out:json`;


  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Google Sheets no respondió correctamente."
      );

    }


    const text =
      await response.text();


    /*
     * Google devuelve:
     *
     * google.visualization.Query.setResponse({...});
     *
     * Extraemos solamente el JSON.
     */

    const start =
      text.indexOf("{");


    const end =
      text.lastIndexOf("}");


    if (
      start === -1 ||
      end === -1
    ) {

      throw new Error(
        "No se pudo interpretar la respuesta de Google Sheets."
      );

    }


    const json =
      JSON.parse(
        text.substring(
          start,
          end + 1
        )
      );


    if (
      !json.table ||
      !json.table.rows
    ) {

      throw new Error(
        "La pestaña plandeoferta no contiene datos."
      );

    }


    /*
     * Convertimos las filas de Sheets
     * al formato que utiliza la aplicación.
     */

    const items =
      json.table.rows
        .map(
          row => {

            const cells =
              row.c || [];


            const get =
              index =>
                cells[index]?.v ?? "";


            return {

              /*
               * B = ITEM
               */

              item:
                get(1),


              /*
               * C = DESCRIPCIÓN
               */

              description:
                get(2),


              /*
               * D = CANTIDAD
               */

              quantity:
                Number(
                  String(
                    get(3)
                  )
                  .replace(
                    /,/g,
                    ""
                  )
                ) || 0,


              /*
               * E = UNIDAD
               */

              unit:
                get(4),


              section:
                ""

            };

          }
        )
        .filter(
          item =>
            item.description ||
            item.item
        );


    /*
     * Enviamos las partidas al selector.
     */

    populate(items);


    /*
     * Actualizamos estado visual.
     */

    $("connectionText").textContent =
      "Google Sheets conectado";


    $("sheetStatusTitle").textContent =
      "Google Sheets";


    $("sheetStatusText").textContent =
      `${items.length} partidas cargadas desde plandeoferta.`;


    $("status").textContent =
      `Conectado · ${items.length} partidas cargadas.`;


    $("status").className =
      "tiny-status ok";


    console.log(
      "Partidas cargadas desde Google Sheets:",
      items
    );


  } catch (error) {

    console.error(
      "Error Google Sheets:",
      error
    );


    $("status").textContent =
      `Error al conectar Google Sheets: ${error.message}`;


    $("status").className =
      "tiny-status error";

  }

}


/* =====================================================
   BOTONES DE MODO
   ===================================================== */

$("individualBtn").onclick =
  () => {

    setMode(
      "individual"
    );

  };


$("teamBtn").onclick =
  () => {

    setMode(
      "team"
    );

  };


/* =====================================================
   ACTIVIDAD
   ===================================================== */

$("activitySelect").onchange =
  loadActivity;


$("clearActivity").onclick =
  () => {

    $("activitySelect").value =
      "";


    loadActivity();

  };


/* =====================================================
   INPUTS
   ===================================================== */

[
  "quantity",
  "unit",
  "yield",
  "efficiency",
  "targetDays",
  "resources",
  "resourcesTarget",
  "peoplePerTeam"
]
.forEach(
  id => {

    const element =
      $(id);


    if (!element) {
      return;
    }


    element.addEventListener(
      "input",
      () => {

        if (
          id === "unit"
        ) {

          updateYieldLabel();

        }


        calculate();

      }
    );

  }
);


/* =====================================================
   INICIALIZACIÓN
   ===================================================== */

setMode(
  "individual"
);


renderPresets();


/*
 * Carga directamente
 * desde TU Google Sheet.
 */

loadGoogleSheet();


calculate();
