const $ = id => document.getElementById(id);


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const CONFIG = {

  sheetsUrl:
    "https://script.google.com/macros/s/AKfycbwnVzt2fEdFVbzLdesB1OMhi6m73Pyg3JrqYbrqEEEZkGFxo30CG5nxK9iR_tVpghfI/exec",

};


/* =========================================================
   ESTADO
========================================================= */

const state = {

  items: [],

  mode: "individual",

  presets:
    JSON.parse(
      localStorage.getItem(
        "obra_presets"
      ) || "[]"
    )

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


function unit() {

  return (
    $("unit")
      .value
      .trim()
  ) || "unidad";

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

  const resource =
    state.mode === "individual"
      ? "persona"
      : "equipo";


  $("yieldSuffix")
    .textContent =
      `${unit()} / ${resource} / día`;


  $("resourceLabel")
    .textContent =
      resourceWord();


  $("resourceLabel2")
    .textContent =
      resourceWord();

}


/* =========================================================
   PARTIDAS
========================================================= */

function populate(
  items
) {

  state.items =
    Array.isArray(items)
      ? items
      : [];


  const select =
    $("activitySelect");


  select.innerHTML =
    `
      <option value="">
        Sin actividad — prueba libre
      </option>
    `;


  state.items.forEach(
    (
      item,
      index
    ) => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        index;


      option.textContent =
        `${item.item || ""} — ${
          item.description || ""
        }` +
        (
          item.quantity !== null &&
          item.quantity !== undefined
            ? ` · ${fmt(
                item.quantity
              )} ${
                item.unit || ""
              }`
            : ""
        );


      select.appendChild(
        option
      );

    }
  );


  $("navCount")
    .textContent =
      state.items.length;


  $("sheetStatusText")
    .textContent =
      `${state.items.length} partidas disponibles.`;

}


/* =========================================================
   SELECCIONAR ACTIVIDAD
========================================================= */

function loadActivity() {

  const value =
    $("activitySelect")
      .value;


  /*
   * Sin actividad:
   * calculadora libre.
   */

  if (
    value === ""
  ) {

    $("activityInfo")
      .textContent =
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


  /*
   * La partida del Sheet
   * proporciona automáticamente:
   *
   * cantidad
   * unidad
   * descripción
   * item
   *
   * El rendimiento NO se reemplaza.
   */

  $("quantity")
    .value =
      item.quantity ?? "";


  $("unit")
    .value =
      item.unit || "";


  $("activityInfo")
    .textContent =
      `Partida ${
        item.item || "—"
      } · ${
        item.description || ""
      }`;


  updateYieldLabel();

  calculate();

}


/* =========================================================
   CALCULADORA
========================================================= */

function calculate() {

  const Q =
    n(
      "quantity"
    );


  const R =
    n(
      "yield"
    );


  const E =
    Math.max(
      0.01,
      n(
        "efficiency",
        100
      )
    ) / 100;


  const targetDays =
    Math.max(
      0.01,
      n(
        "targetDays",
        1
      )
    );


  const resources =
    Math.max(
      1,
      n(
        "resources",
        1
      )
    );


  const targetResources =
    Math.max(
      1,
      n(
        "resourcesTarget",
        1
      )
    );


  const peoplePerTeam =
    Math.max(
      1,
      n(
        "peoplePerTeam",
        1
      )
    );


  const currentUnit =
    unit();


  /*
   * Sin cantidad o rendimiento:
   * no podemos calcular.
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


  /* =====================================================
     PRODUCCIÓN DIARIA
  ===================================================== */

  const dailyProduction =
    R *
    resources *
    E;


  /* =====================================================
     DÍAS CON LOS RECURSOS ACTUALES
  ===================================================== */

  const days =
    Q /
    dailyProduction;


  /* =====================================================
     RECURSOS NECESARIOS
  ===================================================== */

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
      Math.ceil(
        rawRequired
      )
    );


  /* =====================================================
     RENDIMIENTO NECESARIO
  ===================================================== */

  const requiredYield =
    Q /
    (
      targetResources *
      targetDays *
      E
    );


  /* =====================================================
     RESULTADO 1
  ===================================================== */

  if (
    state.mode === "individual"
  ) {

    $("requiredResources")
      .textContent =
        `${required} personas`;


    $("requiredDetail")
      .textContent =
        `${fmt(
          rawRequired
        )} personas → ` +
        `se requieren ${required} personas`;

  } else {

    const totalPeople =
      required *
      peoplePerTeam;


    $("requiredResources")
      .textContent =
        `${required} equipos`;


    $("requiredDetail")
      .textContent =
        `${fmt(
          rawRequired
        )} equipos → ` +
        `se requieren ${required} equipos ` +
        `(${totalPeople} personas)`;

  }


  /* =====================================================
     RESULTADO 2
  ===================================================== */

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
        } ${currentUnit}/día`;

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
        } ${currentUnit}/día · ` +
        `${totalPeople} personas`;

  }


  /* =====================================================
     RESULTADO 3
  ===================================================== */

  const resource =
    resourceSingular();


  $("requiredYield")
    .textContent =
      `${fmt(
        requiredYield
      )} ${currentUnit}/${resource}/día`;


  $("requiredYieldDetail")
    .textContent =
      `Para terminar en ${
        fmt(
          targetDays
        )
      } días con ${
        targetResources
      } ${resourceWord()}.`;


  /* =====================================================
     COMPARACIÓN
  ===================================================== */

  const rows = [];


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

    const production =
      R *
      r *
      E;


    const duration =
      Q /
      production;


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
        `${r} personas`;

    } else {

      resourceText =
        `${r} equipos · ${
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
        ) => `

          <div class="preset">

            <span>

              <b>
                ${preset.name}
              </b>

              ·

              ${fmt(
                preset.yield
              )}

              ${preset.unit}/${
                preset.mode === "individual"
                  ? "persona"
                  : "equipo"
              }/día

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


            $("yield")
              .value =
                preset.yield;


            $("unit")
              .value =
                preset.unit;


            setMode(
              preset.mode
            );

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
          n(
            "yield"
          ),

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
      "Conectando con plandeoferta…";


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
        "Google Sheets · plandeoferta";


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

loadSheets();

calculate();
