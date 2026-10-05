const $ = id => document.getElementById(id);


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const CONFIG = {

  sheetsUrl:
    "https://script.google.com/macros/s/AKfycbxZsOWUFeEMpdFjKcsivDIyhC1cxaCATHHOQAVbXmiM04669GGfx0pp0IHDr5UZJf0-/exec",

};


/* =========================================================
   ESTADO
========================================================= */

const state = {

  items: [],

  mode: "individual",

  presets: (() => {

    try {

      const saved =
        JSON.parse(
          localStorage.getItem(
            "obra_presets"
          ) || "[]"
        );

      return Array.isArray(saved)
        ? saved
        : [];

    } catch {

      return [];

    }

  })()

};


/* =========================================================
   UTILIDADES
========================================================= */

function n(
  id,
  fallback = 0
) {

  const element =
    $(id);

  if (!element) {
    return fallback;
  }

  const value =
    parseFloat(
      element.value
    );

  return Number.isFinite(value)
    ? value
    : fallback;

}


function fmt(
  value,
  decimals = 2
) {

  return Number(
    value
  ).toLocaleString(
    "es-SV",
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals
    }
  );

}


function formatItem(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "";

  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {

    return String(value);

  }

  if (
    Number.isInteger(number)
  ) {

    return String(number);

  }

  return number
    .toFixed(2)
    .replace(
      /0+$/,
      ""
    )
    .replace(
      /\.$/,
      ""
    );

}


function unit() {

  return (
    $("unit")
      .value
      .trim()
  ) || "unidad";

}


function normalizeText(
  value = ""
) {

  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


function normalizeUnit(
  value = ""
) {

  const u =
    normalizeText(value)
      .replace(
        /²/g,
        "2"
      )
      .replace(
        /³/g,
        "3"
      )
      .replace(
        /\./g,
        ""
      )
      .replace(
        /\s+/g,
        ""
      );

  const aliases = {

    "m2": "m2",

    "m3": "m3",

    "ml": "ml",

    "mlineal": "ml",

    "mlineales": "ml",

    "cu": "c/u",

    "c/u": "c/u",

    "unidad": "c/u",

    "un": "c/u",

    "sg": "sg",

    "sumaglobal": "sg"

  };

  return aliases[u] || u;

}


function unitsCompatible(
  activityUnit,
  recommendedUnit
) {

  return (
    normalizeUnit(
      activityUnit
    ) ===
    normalizeUnit(
      recommendedUnit
    )
  );

}


function resourceWord() {

  return state.mode === "team"
    ? "equipos"
    : "personas";

}


function resourceSingular() {

  return state.mode === "team"
    ? "equipo"
    : "persona";

}


function escapeHtml(
  value = ""
) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   MODO DE TRABAJO
========================================================= */

function setMode(
  mode
) {

  state.mode =
    mode;


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


  $("peoplePerTeamWrap")
    .hidden =
      mode !== "team";


  updateYieldLabel();

  calculate();

}


function updateYieldLabel() {

  $("yieldSuffix")
    .textContent =
      `${unit()} / persona / día`;

  $("resourceLabel")
    .textContent =
      resourceWord();

  $("resourceLabel2")
    .textContent =
      resourceWord();

}


function updateQuantityStep() {

  const input =
    $("quantity");

  if (!input) {
    return;
  }

  const value =
    Math.abs(
      parseFloat(
        input.value
      ) || 0
    );

  if (
    value < 1
  ) {

    input.step =
      "0.01";

  } else if (
    value < 10
  ) {

    input.step =
      "0.1";

  } else {

    input.step =
      "1";

  }

}


/* =========================================================
   PARTIDAS
========================================================= */

function populate(
  items
) {

  /*
   * Solo aceptamos partidas reales:
   *
   * - descripción
   * - cantidad
   * - unidad
   * - cantidad numérica
   * - cantidad mayor que cero
   *
   * Los encabezados de sección quedan fuera.
   */

  state.items =
    Array.isArray(items)

      ? items.filter(
          item =>

            item &&

            String(
              item.description || ""
            ).trim() &&

            String(
              item.unit || ""
            ).trim() &&

            String(
              item.quantity ?? ""
            ).trim() !== "" &&

            Number.isFinite(
              Number(
                item.quantity
              )
            ) &&

            Number(
              item.quantity
            ) > 0

        )

      : [];


  const select =
    $("activitySelect");


  select.innerHTML =
    `
      <option value="">
        Sin actividad — prueba libre
      </option>
    `;


  /*
   * Agrupamos por sección.
   *
   * Se utiliza Map para que cada sección
   * aparezca una sola vez.
   */

  const groups =
    new Map();


  state.items.forEach(
    (
      item,
      index
    ) => {

      const section =
        String(
          item.section ||
          "Sin sección"
        ).trim() ||
        "Sin sección";


      if (
        !groups.has(
          section
        )
      ) {

        groups.set(
          section,
          []
        );

      }


      groups
        .get(section)
        .push({
          item,
          index
        });

    }
  );


  /*
   * Creamos un <optgroup> por sección.
   */

  groups.forEach(
    (
      entries,
      section
    ) => {

      const group =
        document.createElement(
          "optgroup"
        );


      group.label =
        section;


      entries.forEach(
        ({
          item,
          index
        }) => {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            index;


          option.textContent =
            `${formatItem(
              item.item
            )} — ${
              item.description
            } · ${
              fmt(
                item.quantity
              )
            } ${
              item.unit || ""
            }`;


          group.appendChild(
            option
          );

        }
      );


      select.appendChild(
        group
      );

    }
  );


  $("navCount")
    .textContent =
      state.items.length;


  $("sheetStatusText")
    .textContent =
      `${state.items.length} partidas disponibles en ${groups.size} secciones.`;

}


/* =========================================================
   SELECCIONAR ACTIVIDAD
========================================================= */

function loadActivity() {

  const value =
    $("activitySelect")
      .value;


  /*
   * SIN ACTIVIDAD
   */

  if (
    value === ""
  ) {

    $("quantity")
      .value =
        "";

    $("unit")
      .value =
        "";

    $("yield")
      .value =
        "";

    $("activityInfo")
      .textContent =
        "Prueba libre: escribe cualquier cantidad, unidad y rendimiento.";

    updateYieldLabel();

    updateQuantityStep();

    calculate();

    return;

  }


  /*
   * BUSCAR PARTIDA
   */

  const item =
    state.items[
      Number(value)
    ];


  if (!item) {
    return;
  }


  /*
   * CARGAR DATOS DE LA PARTIDA
   */

  $("quantity")
    .value =
      item.quantity ?? "";


  $("unit")
    .value =
      item.unit || "";


  /*
   * BUSCAR RENDIMIENTO
   */

  const recommendation =
    getRecommendedYield(
      item
    );


  const activityName =
    `Partida ${
      item.item || "—"
    } · ${
      item.description || ""
    }`;


  const sectionText =
    item.section
      ? ` · ${item.section}`
      : "";


  if (
    recommendation
  ) {

    $("yield")
      .value =
        recommendation.yield;


    $("activityInfo")
      .textContent =
        `${activityName}${sectionText} · ` +
        `Rendimiento sugerido: ` +
        `${recommendation.yield} ` +
        `${item.unit || recommendation.unit}` +
        `/persona/día · editable`;

  } else {

    /*
     * Si no tenemos referencia,
     * NO inventamos un rendimiento.
     */

    $("yield")
      .value =
        "";


    $("activityInfo")
      .textContent =
        `${activityName}${sectionText} · ` +
        `Sin rendimiento de referencia para ` +
        `${item.unit || "esta unidad"}. ` +
        `Ingresa uno manualmente.`;

  }


  updateYieldLabel();

  updateQuantityStep();

  calculate();

}


/* =========================================================
   BIBLIOTECA BASE DE RENDIMIENTOS
========================================================= */

/*
 * TODOS LOS RENDIMIENTOS:
 *
 * UNIDADES DE PARTIDA / PERSONA / DÍA
 *
 * Son REFERENCIALES y EDITABLES.
 */

const yieldLibrary = [

  /* =======================================================
     PISOS / CERÁMICOS
  ======================================================= */

  {
    keywords: [
      "porcelanato"
    ],

    unit:
      "m2",

    yield:
      4,

    source:
      "referencia PUPR"
  },


  {
    keywords: [
      "ceramica",
      "cerámica"
    ],

    unit:
      "m2",

    yield:
      8,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "zocalo",
      "zócalo"
    ],

    unit:
      "ml",

    yield:
      20,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "junta"
    ],

    unit:
      "ml",

    yield:
      30,

    source:
      "referencia de producción"
  },


  /* =======================================================
     TABLAYESO / DIVISIONES
  ======================================================= */

  {
    keywords: [
      "tablayeso"
    ],

    unit:
      "m2",

    yield:
      12,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "densglass"
    ],

    unit:
      "m2",

    yield:
      10,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "drywall"
    ],

    unit:
      "m2",

    yield:
      12,

    source:
      "referencia de producción"
  },


  /* =======================================================
     PINTURA
  ======================================================= */

  {
    keywords: [
      "pintura"
    ],

    unit:
      "m2",

    yield:
      30,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "empaste",
      "lijado"
    ],

    unit:
      "m2",

    yield:
      25,

    source:
      "referencia de producción"
  },


  /* =======================================================
     DEMOLICIONES
  ======================================================= */

  {
    keywords: [
      "demolicion de muro",
      "demolición de muro"
    ],

    unit:
      "m2",

    yield:
      10,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "demolicion de drywall",
      "demolición de drywall"
    ],

    unit:
      "m2",

    yield:
      20,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "demolicion",
      "demolición"
    ],

    unit:
      "m2",

    yield:
      8,

    source:
      "referencia general"
  },


  /* =======================================================
     TIERRA / EXCAVACIÓN
  ======================================================= */

  {
    keywords: [
      "excavacion manual",
      "excavación manual"
    ],

    unit:
      "m3",

    yield:
      1.5,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "excavacion para tuberias",
      "excavación para tuberías"
    ],

    unit:
      "m3",

    yield:
      1.5,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "compactacion",
      "compactación"
    ],

    unit:
      "m3",

    yield:
      10,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "relleno",
      "relleno manual"
    ],

    unit:
      "m3",

    yield:
      10,

    source:
      "referencia de producción"
  },


  /* =======================================================
     PUERTAS / CARPINTERÍA
  ======================================================= */

  {
    keywords: [
      "puerta"
    ],

    unit:
      "c/u",

    yield:
      4,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "marco de puerta",
      "marco puerta"
    ],

    unit:
      "c/u",

    yield:
      5,

    source:
      "referencia de producción"
  },


  /* =======================================================
     VIDRIO / VENTANAS
  ======================================================= */

  {
    keywords: [
      "ventana"
    ],

    unit:
      "c/u",

    yield:
      6,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "vidrio"
    ],

    unit:
      "m2",

    yield:
      5,

    source:
      "referencia de producción"
  },


  /* =======================================================
     ELÉCTRICA
  ======================================================= */

  {
    keywords: [
      "instalacion electrica",
      "instalación eléctrica"
    ],

    unit:
      "c/u",

    yield:
      8,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "punto electrico",
      "punto eléctrico"
    ],

    unit:
      "c/u",

    yield:
      8,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "tomacorriente"
    ],

    unit:
      "c/u",

    yield:
      8,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "interruptor"
    ],

    unit:
      "c/u",

    yield:
      8,

    source:
      "referencia de producción"
  },


  /* =======================================================
     HIDROSANITARIA
  ======================================================= */

  {
    keywords: [
      "instalacion hidrosanitaria",
      "instalación hidrosanitaria"
    ],

    unit:
      "c/u",

    yield:
      5,

    source:
      "referencia de producción"
  },


  {
    keywords: [
      "artefacto sanitario",
      "aparato sanitario",
      "sanitario"
    ],

    unit:
      "c/u",

    yield:
      5,

    source:
      "referencia de producción"
  }

];


/* =========================================================
   BUSCAR RENDIMIENTO RECOMENDADO
========================================================= */

function getRecommendedYield(
  item
) {

  if (!item) {
    return null;
  }


  const text =
    normalizeText(
      item.description || ""
    );


  /*
   * Primero buscamos coincidencia
   * por descripción Y unidad.
   *
   * Esto evita, por ejemplo,
   * recomendar un rendimiento de
   * m² para una partida c/u.
   */

  const compatibleMatch =
    yieldLibrary.find(
      entry =>

        unitsCompatible(
          item.unit,
          entry.unit
        ) &&

        entry.keywords.some(
          keyword =>
            text.includes(
              normalizeText(
                keyword
              )
            )
        )

    );


  if (
    compatibleMatch
  ) {

    return compatibleMatch;

  }


  return null;

}


/* =========================================================
   CALCULADORA
========================================================= */

function calculate() {

  /*
   * CANTIDAD
   */

  const Q =
    n(
      "quantity"
    );


  /*
   * RENDIMIENTO
   *
   * unidades / persona / día
   */

  const R =
    n(
      "yield"
    );


  /*
   * EFICIENCIA
   */

  const E =
    Math.max(
      0.01,

      n(
        "efficiency",
        100
      )

    ) / 100;


  /*
   * PLAZO OBJETIVO
   */

  const targetDays =
    Math.max(
      0.01,

      n(
        "targetDays",
        1
      )
    );


  /*
   * RECURSOS ACTUALES
   *
   * En individual:
   * personas
   *
   * En equipo:
   * equipos
   */

  const resources =
    Math.max(
      1,

      n(
        "resources",
        1
      )
    );


  /*
   * RECURSOS DEL ESCENARIO 3
   */

  const targetResources =
    Math.max(
      1,

      n(
        "resourcesTarget",
        1
      )
    );


  /*
   * PERSONAS POR EQUIPO
   */

  const peoplePerTeam =
    Math.max(
      1,

      n(
        "peoplePerTeam",
        1
      )
    );


  /*
   * CONVERSIÓN A PERSONAS REALES
   */

  const activePeople =
    state.mode === "team"

      ? resources *
        peoplePerTeam

      : resources;


  const targetPeople =
    state.mode === "team"

      ? targetResources *
        peoplePerTeam

      : targetResources;


  const currentUnit =
    unit();


  /*
   * SI NO TENEMOS CANTIDAD
   * O RENDIMIENTO, NO CALCULAMOS.
   */

  if (
    Q <= 0 ||
    R <= 0
  ) {

    $("requiredResources")
      .textContent =
        "—";


    $("requiredDetail")
      .textContent =
        "Ingresa cantidad y rendimiento.";


    $("calculatedDays")
      .textContent =
        "—";


    $("productionDetail")
      .textContent =
        "Producción: —";


    $("requiredYield")
      .textContent =
        "—";


    $("requiredYieldDetail")
      .textContent =
        "Ingresa cantidad, plazo y recursos.";


    $("scenarioTable")
      .innerHTML =
        "";


    return;

  }


  /* =======================================================
     PRODUCCIÓN DIARIA
  ======================================================= */

  const dailyProduction =
    R *
    activePeople *
    E;


  /* =======================================================
     DÍAS CON LOS RECURSOS ACTUALES
  ======================================================= */

  const days =
    Q /
    dailyProduction;


  /* =======================================================
     RECURSOS NECESARIOS
  ======================================================= */

  /*
   * Personas necesarias:
   *
   * Q
   * ────────────────
   * R × días × E
   */

  const rawRequired =
    Q /
    (
      R *
      targetDays *
      E
    );


  const requiredPeople =
    Math.max(
      1,
      Math.ceil(
        rawRequired
      )
    );


  /* =======================================================
     RENDIMIENTO NECESARIO
  ======================================================= */

  /*
   * IMPORTANTE:
   *
   * El rendimiento está definido
   * por PERSONA / DÍA.
   *
   * Por eso en modo equipo primero
   * convertimos equipos → personas.
   */

  const requiredYield =
    Q /
    (
      targetPeople *
      targetDays *
      E
    );


  /* =======================================================
     RESULTADO 1
  ======================================================= */

  if (
    state.mode === "individual"
  ) {

    $("requiredResources")
      .textContent =
        `${requiredPeople} ${
          requiredPeople === 1
            ? "persona"
            : "personas"
        }`;


    $("requiredDetail")
      .textContent =
        `${fmt(
          rawRequired
        )} personas calculadas → ` +
        `se requieren ${requiredPeople} personas`;

  } else {

    /*
     * En modo equipo redondeamos
     * hacia arriba el número de equipos.
     */

    const requiredTeams =
      Math.ceil(
        requiredPeople /
        peoplePerTeam
      );


    const totalPeople =
      requiredTeams *
      peoplePerTeam;


    $("requiredResources")
      .textContent =
        `${requiredTeams} ${
          requiredTeams === 1
            ? "equipo"
            : "equipos"
        }`;


    $("requiredDetail")
      .textContent =
        `${requiredTeams} ${
          requiredTeams === 1
            ? "equipo"
            : "equipos"
        } de ` +
        `${peoplePerTeam} personas · ` +
        `${totalPeople} personas en total`;

  }


  /* =======================================================
     RESULTADO 2
  ======================================================= */

  $("calculatedDays")
    .textContent =
      `${fmt(
        days
      )} días`;


  if (
    state.mode === "individual"
  ) {

    $("productionDetail")
      .textContent =
        `Producción: ${
          fmt(
            dailyProduction
          )
        } ${
          currentUnit
        }/día`;

  } else {

    const totalPeople =
      resources *
      peoplePerTeam;


    $("productionDetail")
      .textContent =
        `Producción: ${
          fmt(
            dailyProduction
          )
        } ${
          currentUnit
        }/día · ` +
        `${totalPeople} personas`;

  }


  /* =======================================================
     RESULTADO 3
  ======================================================= */

  $("requiredYield")
    .textContent =
      `${fmt(
        requiredYield
      )} ${
        currentUnit
      }/persona/día`;


  $("requiredYieldDetail")
    .textContent =
      state.mode === "team"

        ? `${targetResources} ${
            targetResources === 1
              ? "equipo"
              : "equipos"
          } · ${
            targetPeople
          } personas · ${
            fmt(
              targetDays
            )
          } días objetivo.`

        : `${targetPeople} ${
            targetPeople === 1
              ? "persona"
              : "personas"
          } · ${
            fmt(
              targetDays
            )
          } días objetivo.`;


  /* =======================================================
     COMPARACIÓN
  ======================================================= */

  const rows = [];


  /*
   * Mostramos:
   *
   * recursos -2
   * recursos -1
   * recursos
   * recursos +1
   * recursos +2
   */

  const start =
    Math.max(
      1,
      Math.floor(
        resources
      ) - 2
    );


  const end =
    Math.floor(
      resources
    ) + 2;


  for (
    let r = start;
    r <= end;
    r++
  ) {

    /*
     * Convertimos equipos a personas
     * cuando corresponde.
     */

    const comparisonPeople =
      state.mode === "team"

        ? r *
          peoplePerTeam

        : r;


    /*
     * Producción diaria
     */

    const production =
      R *
      comparisonPeople *
      E;


    /*
     * Duración
     */

    const duration =
      Q /
      production;


    /*
     * Diferencia contra objetivo
     */

    const difference =
      (
        (
          duration -
          targetDays
        ) /
        targetDays
      ) *
      100;


    let resourceText;


    if (
      state.mode === "individual"
    ) {

      resourceText =
        `${r} ${
          r === 1
            ? "persona"
            : "personas"
        }`;

    } else {

      resourceText =
        `${r} ${
          r === 1
            ? "equipo"
            : "equipos"
        } · ${
          r *
          peoplePerTeam
        } pers.`;

    }


    rows.push(
      `
        <tr>

          <td>
            <b>
              ${resourceText}
            </b>
          </td>

          <td>
            ${fmt(
              production
            )}
            ${currentUnit}/día
          </td>

          <td>
            <b>
              ${fmt(
                duration
              )} días
            </b>
          </td>

          <td class="${
            duration <= targetDays
              ? "good"
              : "warn"
          }">

            ${
              duration <= targetDays

                ? "✓ Cumple"

                : `+${fmt(
                    difference
                  )}%`

            }

          </td>

        </tr>
      `
    );

  }


  $("scenarioTable")
    .innerHTML =
      rows.join("");

}


/* =========================================================
   BIBLIOTECA DE RENDIMIENTOS
========================================================= */

function renderPresets() {

  const box =
    $("presetList");


  if (
    !state.presets.length
  ) {

    box.innerHTML =
      `
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
        (
          preset,
          index
        ) =>

          `

            <div class="preset">

              <span>

                <b>
                  ${escapeHtml(
                    preset.name
                  )}
                </b>

                ·

                ${fmt(
                  preset.yield
                )}

                ${
                  escapeHtml(
                    preset.unit
                  )
                }/persona/día

              </span>

              <button
                data-preset="${index}"
              >
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


            if (!preset) {
              return;
            }


            $("yield")
              .value =
                preset.yield;


            $("unit")
              .value =
                preset.unit;


            setMode(
              preset.mode ||
              "individual"
            );


            updateYieldLabel();

            calculate();

          };

      }
    );

}


/* =========================================================
   GUARDAR RENDIMIENTO
========================================================= */

$("savePreset")
  .onclick =
    () => {

      const yieldValue =
        n(
          "yield"
        );


      if (
        yieldValue <= 0
      ) {

        alert(
          "Ingresa un rendimiento válido antes de guardarlo."
        );

        return;

      }


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

        name:
          name.trim(),

        yield:
          yieldValue,

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


/* =========================================================
   GOOGLE SHEETS
========================================================= */

function loadGoogleJSONP(
  url
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const callback =
        `obraCallback_${
          Date.now()
        }`;


      const script =
        document.createElement(
          "script"
        );


      const timeout =
        setTimeout(
          () => {

            cleanup();

            reject(
              new Error(
                "Tiempo de espera agotado."
              )
            );

          },
          15000
        );


      function cleanup() {

        clearTimeout(
          timeout
        );


        delete window[
          callback
        ];


        script.remove();

      }


      window[
        callback
      ] =
        data => {

          cleanup();


          if (
            data?.ok === false
          ) {

            reject(
              new Error(
                data.error ||
                "Error de Google Sheets."
              )
            );

            return;

          }


          resolve(
            data
          );

        };


      script.src =
        url.replace(
          /\/+$/,
          ""
        ) +
        (
          url.includes("?")
            ? "&"
            : "?"
        ) +
        `callback=${callback}`;


      script.onerror =
        () => {

          cleanup();

          reject(
            new Error(
              "No se pudo acceder al Web App de Google Sheets."
            )
          );

        };


      document.body.appendChild(
        script
      );

    }
  );

}


async function loadSheets() {

  const url =
    CONFIG.sheetsUrl;


  if (
    !url ||
    url.includes(
      "PEGA_AQUI"
    )
  ) {

    $("status")
      .textContent =
        "Falta configurar la URL del Web App de Google Apps Script.";


    $("status")
      .className =
        "tiny-status error";


    return;

  }


  $("status")
    .textContent =
      "Conectando con PLAN DE OFERTA…";


  $("status")
    .className =
      "tiny-status";


  try {

    const data =
      await loadGoogleJSONP(
        url
      );


    if (
      !Array.isArray(
        data.items
      )
    ) {

      throw new Error(
        "La respuesta de Google Sheets no contiene partidas."
      );

    }


    populate(
      data.items
    );


    $("connectionText")
      .textContent =
        "Google Sheets conectado";


    $("sheetStatusTitle")
      .textContent =
        "Google Sheets · PLAN DE OFERTA";


    $("sheetStatusText")
      .textContent =
        `${data.items.length} partidas cargadas.`;


    $("status")
      .textContent =
        `Conectado · ${
          data.items.length
        } partidas cargadas.`;


    $("status")
      .className =
        "tiny-status ok";


  } catch (
    error
  ) {

    console.error(
      error
    );


    $("connectionText")
      .textContent =
        "Error de conexión";


    $("sheetStatusTitle")
      .textContent =
        "Google Sheets";


    $("sheetStatusText")
      .textContent =
        "No se pudieron cargar las partidas.";


    $("status")
      .textContent =
        error.message;


    $("status")
      .className =
        "tiny-status error";

  }

}


/* =========================================================
   EVENTOS
========================================================= */

$("individualBtn")
  .onclick =
    () => {

      setMode(
        "individual"
      );

    };


$("teamBtn")
  .onclick =
    () => {

      setMode(
        "team"
      );

    };


$("activitySelect")
  .onchange =
    loadActivity;


$("clearActivity")
  .onclick =
    () => {

      $("activitySelect")
        .value =
          "";

      loadActivity();

    };


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


        if (
          id === "quantity"
        ) {

          updateQuantityStep();

        }


        calculate();

      }
    );

  }
);


/* =========================================================
   INICIO
========================================================= */

setMode(
  "individual"
);

renderPresets();

updateQuantityStep();

calculate();

loadSheets();
