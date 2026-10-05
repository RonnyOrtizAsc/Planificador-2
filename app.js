const $ = id => document.getElementById(id);

const state = {
  items: [],
  mode: "individual",
  presets: JSON.parse(localStorage.getItem("obra_presets") || "[]")
};


/* =========================================================
   UTILIDADES
========================================================= */

function n(id, fallback = 0) {
  const value = parseFloat($(id).value);
  return Number.isFinite(value) ? value : fallback;
}

function fmt(value, decimals = 2) {
  return Number(value).toLocaleString("es-SV", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function unit() {
  return $("unit").value.trim() || "unidad";
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
   MODO INDIVIDUAL / EQUIPO
========================================================= */

function setMode(mode) {
  state.mode = mode;

  $("individualBtn").classList.toggle(
    "selected",
    mode === "individual"
  );

  $("teamBtn").classList.toggle(
    "selected",
    mode === "team"
  );

  $("peoplePerTeamWrap").hidden = mode !== "team";

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


/* =========================================================
   PARTIDAS DEL PROYECTO
========================================================= */

function populate(items) {
  state.items = Array.isArray(items)
    ? items
    : [];

  const select = $("activitySelect");

  select.innerHTML =
    '<option value="">Sin actividad — prueba libre</option>';

  state.items.forEach((item, index) => {

    const option =
      document.createElement("option");

    option.value = index;

    option.textContent =
      `${item.item || ""} — ${item.description}` +
      `${item.quantity != null
        ? ` · ${fmt(item.quantity)} ${item.unit || ""}`
        : ""
      }`;

    select.appendChild(option);
  });

  $("navCount").textContent =
    state.items.length;

  $("sheetStatusText").textContent =
    `${state.items.length} partidas disponibles localmente.`;
}


function loadActivity() {

  const value =
    $("activitySelect").value;

  /*
    Si no hay actividad seleccionada,
    la aplicación funciona como calculadora
    completamente manual.
  */

  if (value === "") {

    $("activityInfo").textContent =
      "Prueba libre: escribe cualquier cantidad, unidad y rendimiento.";

    return;
  }

  const item =
    state.items[Number(value)];

  if (!item) return;

  /*
    La partida solamente proporciona
    cantidad + unidad + descripción.

    El rendimiento sigue siendo editable.
  */

  $("quantity").value =
    item.quantity ?? "";

  $("unit").value =
    item.unit || "";

  $("activityInfo").textContent =
    `${item.section
      ? item.section + " · "
      : ""
    }Partida ${item.item || "—"} · ${item.description}`;

  updateYieldLabel();

  calculate();
}


/* =========================================================
   CALCULADORA PRINCIPAL
========================================================= */

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
    Si no hay datos válidos,
    limpiamos resultados.
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


  /* =====================================================
     1. PRODUCCIÓN DIARIA
     
     Producción =
     rendimiento × recursos × eficiencia
  ===================================================== */

  const dailyProduction =
    R *
    resources *
    E;


  /* =====================================================
     2. DÍAS CON X RECURSOS
     
     Días =
     cantidad / producción diaria
  ===================================================== */

  const days =
    Q /
    dailyProduction;


  /* =====================================================
     3. RECURSOS NECESARIOS
     
     Recursos =
     cantidad /
     (rendimiento × días × eficiencia)
     
     Se redondea hacia arriba porque
     no podemos contratar 2.3 personas/equipos.
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
      Math.ceil(rawRequired)
    );


  /* =====================================================
     4. RENDIMIENTO NECESARIO
     
     Rendimiento =
     cantidad /
     (recursos × días × eficiencia)
  ===================================================== */

  const requiredYield =
    Q /
    (
      targetResources *
      targetDays *
      E
    );


  /* =====================================================
     PERSONAS TOTALES EN MODO EQUIPO
  ===================================================== */

  const totalRequiredPeople =
    mode === "team"
      ? required * peoplePerTeam
      : required;

  const activePeople =
    mode === "team"
      ? resources * peoplePerTeam
      : resources;


  /* =====================================================
     RESULTADO 1
  ===================================================== */

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


  /* =====================================================
     RESULTADO 2
  ===================================================== */

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


  /* =====================================================
     RESULTADO 3
  ===================================================== */

  $("requiredYield").textContent =
    `${fmt(requiredYield)} ` +
    `${currentUnit}/` +
    `${resourceNameSingular}/día`;


  /* =====================================================
     TABLA DE ESCENARIOS
  ===================================================== */

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
            (duration - targetDays) /
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


/* =========================================================
   BIBLIOTECA DE RENDIMIENTOS
========================================================= */

function renderPresets() {

  const box =
    $("presetList");


  if (!state.presets.length) {

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
    .forEach(button => {

      button.onclick = () => {

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

    });
}


/* =========================================================
   GUARDAR RENDIMIENTO
========================================================= */

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


    if (!name) return;


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


/* =========================================================
   CARGAR JSON LOCAL
========================================================= */

async function loadLocal() {

  try {

    const response =
      await fetch(
        "data_proyecto.json"
      );


    if (!response.ok) {
      throw new Error();
    }


    const data =
      await response.json();


    populate(data);


    $("connectionText").textContent =
      "Datos locales";


    $("sheetStatusTitle").textContent =
      "Datos del Excel";


    $("status").textContent =
      `Listo · ${data.length} partidas cargadas.`;

    $("status").className =
      "tiny-status ok";


  } catch (error) {

    $("status").textContent =
      "No se pudo cargar data_proyecto.json. " +
      "Asegúrate de subirlo al mismo directorio " +
      "que index.html.";

    $("status").className =
      "tiny-status error";

  }

}


/* =========================================================
   GOOGLE SHEETS / APPS SCRIPT
========================================================= */

function loadGoogleJSONP(url) {

  return new Promise(
    (resolve, reject) => {

      const callback =
        `obraCallback_${Date.now()}`;


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


      window[callback] =
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

          } else {

            resolve(data);

          }

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
              "No se pudo acceder al Web App de Apps Script."
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

  const raw =
    $("sheetsUrl")
      .value
      .trim();


  if (!raw) {

    $("status").textContent =
      "Pega primero la URL del Web App.";

    $("status").className =
      "tiny-status error";

    return;

  }


  $("status").textContent =
    "Conectando…";

  $("status").className =
    "tiny-status";


  try {

    const data =
      await loadGoogleJSONP(
        raw
      );


    if (
      !Array.isArray(
        data.items
      )
    ) {

      throw new Error(
        "La respuesta no contiene partidas."
      );

    }


    populate(
      data.items
    );


    $("connectionText").textContent =
      "Google Sheets conectado";


    $("sheetStatusTitle").textContent =
      "Google Sheets";


    $("sheetStatusText").textContent =
      `${data.items.length} partidas recibidas.`;


    $("status").textContent =
      `Conectado · ${data.items.length} partidas.`;

    $("status").className =
      "tiny-status ok";


  } catch (error) {

    $("status").textContent =
      error.message;

    $("status").className =
      "tiny-status error";

  }

}


/* =========================================================
   EVENTOS
========================================================= */

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


$("activitySelect").onchange =
  loadActivity;


$("clearActivity").onclick =
  () => {

    $("activitySelect").value =
      "";

    loadActivity();

  };


/*
  Inputs que actualizan
  la calculadora automáticamente.
*/

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
.forEach(id => {

  $(id).addEventListener(
    "input",
    () => {

      if (id === "unit") {
        updateYieldLabel();
      }

      calculate();

    }
  );

});


$("loadLocal").onclick =
  loadLocal;


$("loadSheets").onclick =
  loadSheets;


/* =========================================================
   INICIO
========================================================= */

setMode(
  "individual"
);

renderPresets();

loadLocal();

calculate();
