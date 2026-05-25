// 1. CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://noirhvzgawswgeegcypg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaXJodnpnYXdzd2dlZWdjeXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzMxNTksImV4cCI6MjA5NTIwOTE1OX0.X9Oo325y5J-GBympMUHajt_o-DUa3eP_yaTsunJudw0";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// VARIABLES GLOBALES DE ESTADO
let salaActual = null;
let miUsuario = null;
let jugadoresEnSala = [];
let turnoActualId = null;
let turnoActualDatos = null;
let saltosRestantes = 3;
let intervaloCronometro = null;
let palabraActualTexto = "";
let palabrasUsadasEnTurno = [];
let procesandoAccion = false;

// ID de sesión único para identificar al navegador
if (!localStorage.getItem('tabu_sesion_id')) {
    localStorage.setItem('tabu_sesion_id', Math.random().toString(36).substring(2, 15));
}
const sesionId = localStorage.getItem('tabu_sesion_id');

// =========================================================================
// 2. ELEMENTOS DEL DOM
// =========================================================================
const pantallas = {
    inicio: document.getElementById('pantalla-inicio'),
    espera: document.getElementById('pantalla-espera'),
    juego: document.getElementById('pantalla-juego'),
    resumenTurno: document.getElementById('pantalla-resumen-turno'),
    resumenRonda: document.getElementById('pantalla-resumen-ronda')
};

const btnCrear = document.getElementById('btn-crear-sala');
const btnUnirse = document.getElementById('btn-unirse-sala');
const btnEmpezar = document.getElementById('btn-empezar-partida');
const inputNombre = document.getElementById('input-nombre');
const inputCodigo = document.getElementById('input-codigo');
const txtCodigo = document.getElementById('txt-codigo-sala');
const listaJugadoresUI = document.getElementById('lista-jugadores');

// Inputs de Ajustes (Panel de Control)
const selectCategoria = document.getElementById('select-categoria');
const inputTiempo = document.getElementById('input-tiempo');
const inputRondas = document.getElementById('input-rondas');
const inputSaltos = document.getElementById('input-saltos');

// UI Juego
const txtRol = document.getElementById('txt-rol-juego');
const txtTurnoDe = document.getElementById('txt-turno-de');
const txtCronometro = document.getElementById('txt-cronometro');
const vistaOrador = document.getElementById('vista-orador');
const vistaAdivinador = document.getElementById('vista-adivinador');
const vistaControlador = document.getElementById('vista-controlador');
const bloqueBotonesOrador = document.getElementById('bloque-botones-orador');
const elPalabraPrincipal = document.getElementById('palabra-principal');
const elListaProhibidas = document.getElementById('lista-prohibidas');

const btnAcierto = document.getElementById('btn-acierto');
const btnSaltar = document.getElementById('btn-saltar');
const btnTabu = document.getElementById('btn-tabu');

// UI Resúmenes
const txtResumenOrador = document.getElementById('txt-resumen-orador');
const listaResumenAcertadas = document.getElementById('lista-resumen-acertadas');
const listaResumenSaltadas = document.getElementById('lista-resumen-saltadas');
const listaResumenTabu = document.getElementById('lista-resumen-tabu');
const btnContinuarTurno = document.getElementById('btn-continuar-turno');
const txtNumeroRondaFin = document.getElementById('txt-numero-ronda-fin');
const tablaPosiciones = document.getElementById('tabla-posiciones');
const btnSiguienteRonda = document.getElementById('btn-siguiente-ronda');

// =========================================================================
// 3. LÓGICA DE PANEL DE CONTROL / CONFIGURACIÓN
// =========================================================================

function alternarPantalla(pantallaVisible) {
    Object.values(pantallas).forEach(p => p.classList.add('hidden'));
    pantallaVisible.classList.remove('hidden');
}

// Carga las categorías dinámicamente desde tu tabla 'mazo_palabras'
async function cargarCategoriasOpciones() {
    const { data } = await db.from('mazo_palabras').select('categoria');
    selectCategoria.innerHTML = '<option value="todas">✨ Todas las categorías</option>';
    if (data) {
        const categoriasUnicas = [...new Set(data.map(item => item.categoria).filter(Boolean))];
        categoriasUnicas.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.innerText = cat;
            selectCategoria.appendChild(opt);
        });
    }
}

// Guarda inmediatamente en Supabase cualquier cambio que haga el Anfitrión
async function registrarCambioAjustes() {
    if (!miUsuario || !miUsuario.es_anfitrion || !salaActual) return;
    
    const { error } = await db.from('salas').update({
        tiempo_ronda: parseInt(inputTiempo.value) || 60,
        max_rondas: parseInt(inputRondas.value) || 3,
        max_saltos: parseInt(inputSaltos.value) || 3,
        categoria_id: selectCategoria.value === 'todas' ? null : selectCategoria.value 
    }).eq('id', salaActual.id);

    if (error) console.error("Error guardando ajustes:", error);
}

// Vincula los eventos de cambio a los inputs de la interfaz
[inputTiempo, inputRondas, inputSaltos, selectCategoria].forEach(el => {
    el.addEventListener('input', registrarCambioAjustes); // 'input' guarda mientras arrastras o cambias
});

// Sincroniza visualmente los inputs para los invitados y bloquea su edición
function aplicarAjustesEnUI(sala) {
    // Si NO soy el creador de la sala, me deshabilito los controles
    const esAnfitrion = miUsuario && miUsuario.es_anfitrion;
    inputTiempo.disabled = !esAnfitrion;
    inputRondas.disabled = !esAnfitrion;
    inputSaltos.disabled = !esAnfitrion;
    selectCategoria.disabled = !esAnfitrion;

    // Actualizo el valor visual de los inputs con lo que tiene la Base de Datos
    inputTiempo.value = sala.tiempo_ronda;
    inputRondas.value = sala.max_rondas;
    inputSaltos.value = sala.max_saltos;
    selectCategoria.value = sala.categoria_id === null ? 'todas' : sala.categoria_id;
}

// =========================================================================
// 4. CREACIÓN Y UNIÓN A SALA
// =========================================================================

btnCrear.addEventListener('click', async () => {
    const nombre = inputNombre.value.trim();
    if (!nombre) return alert("Introduce tu nombre");
    
    await cargarCategoriasOpciones();
    const codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Valores iniciales por defecto al crear la sala
    const { data: sala, error: errS } = await db.from('salas')
        .insert([{ codigo: codigoSala, estado: 'esperando', tiempo_ronda: 60, max_rondas: 3, max_saltos: 3, ronda_actual: 1, categoria_id: null }])
        .select().single();

    if (errS) return alert("Error al crear sala en la base de datos");

    salaActual = sala;
    const { data: jugador } = await db.from('jugadores')
        .insert([{ sala_id: sala.id, nombre: nombre, es_anfitrion: true, sesion_id: sesionId, puntos: 0 }])
        .select().single();

    miUsuario = jugador;
    mostrarPantallaEspera();
});

btnUnirse.addEventListener('click', async () => {
    const nombre = inputNombre.value.trim();
    const codigo = inputCodigo.value.trim().toUpperCase();
    if (!nombre || !codigo) return alert("Faltan datos para ingresar");

    await cargarCategoriasOpciones();
    const { data: sala } = await db.from('salas').select('*').eq('codigo', codigo).maybeSingle();
    if (!sala) return alert("La sala especificada no existe");

    salaActual = sala;
    const { data: jugador } = await db.from('jugadores')
        .insert([{ sala_id: sala.id, nombre: nombre, es_anfitrion: false, sesion_id: sesionId, puntos: 0 }])
        .select().single();

    miUsuario = jugador;
    mostrarPantallaEspera();
});

// =========================================================================
// 5. LOBBY Y REALTIME (SINCRONIZACIÓN DE PANTALLAS)
// =========================================================================

function mostrarPantallaEspera() {
    alternarPantalla(pantallas.espera);
    txtCodigo.innerText = salaActual.codigo;
    
    if (miUsuario.es_anfitrion) {
        btnEmpezar.classList.remove('hidden');
    } else {
        btnEmpezar.classList.add('hidden');
    }

    aplicarAjustesEnUI(salaActual);
    actualizarListaJugadoresDeBaseDatos();
    activarMonitoreoRealtime();
}

async function actualizarListaJugadoresDeBaseDatos() {
    const { data: jugadores } = await db.from('jugadores')
        .select('*').eq('sala_id', salaActual.id).order('creado_en', { ascending: true });
    jugadoresEnSala = jugadores || [];
    listaJugadoresUI.innerHTML = jugadoresEnSala.map(j => `
        <li class="bg-slate-700/80 p-3 rounded-xl flex justify-between items-center text-sm font-semibold">
            <span>${j.nombre} ${j.es_anfitrion ? '👑' : ''}</span>
            <span class="text-indigo-300">${j.puntos || 0} pts</span>
        </li>
    `).join('');
}

function activarMonitoreoRealtime() {
    // Escucha cambios en la sala (Ajustes modificados por el creador o cambios de estado)
    db.channel(`sala-${salaActual.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'salas', filter: `id=eq.${salaActual.id}` }, 
            (payload) => {
                salaActual = payload.new;
                
                // Aquí ocurre la magia: actualiza los inputs de todos en tiempo real
                aplicarAjustesEnUI(salaActual);
                
                if (salaActual.estado === 'jugando') alternarPantalla(pantallas.juego);
                if (salaActual.estado === 'resumen_ronda') mostrarResumenRonda();
            }
        ).subscribe();

    // Escucha cuando entran nuevos jugadores
    db.channel(`jugadores-${salaActual.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jugadores', filter: `sala_id=eq.${salaActual.id}` }, 
            () => actualizarListaJugadoresDeBaseDatos()
        ).subscribe();

    // Escucha el flujo de los turnos
    db.channel(`turnos-${salaActual.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos', filter: `sala_id=eq.${salaActual.id}` }, 
            async (payload) => {
                const turno = payload.new;
                if (!turno) return;
                turnoActualDatos = turno;
                
                if (turno.estado === 'resumen') {
                    mostrarResumenTurno(turno);
                } else if (turnoActualId !== turno.id) {
                    turnoActualId = turno.id;
                    // Aplicar la cantidad de saltos configurada en la sala
                    saltosRestantes = salaActual.max_saltos;
                    palabrasUsadasEnTurno = []; 
                    sincronizarCronometro(turno.termina_at, turno.id);
                    alternarPantalla(pantallas.juego);
                    configurarPantallaSegunRol(turno);
                } else {
                    configurarPantallaSegunRol(turno);
                }
            }
        ).subscribe();
}

// =========================================================================
// 6. MOTOR DE JUEGO
// =========================================================================

async function actualizarPuntos(jugadorId, variacion) {
    const { data: jug } = await db.from('jugadores').select('puntos').eq('id', jugadorId).single();
    if (jug) {
        await db.from('jugadores').update({ puntos: (jug.puntos || 0) + variacion }).eq('id', jugadorId);
    }
}

btnEmpezar.addEventListener('click', async () => {
    if (jugadoresEnSala.length < 2) return alert("Se necesitan al menos 2 jugadores para iniciar.");
    await db.from('salas').update({ estado: 'jugando' }).eq('id', salaActual.id);
    await iniciarNuevoTurno();
});

async function iniciarNuevoTurno() {
    const { data: tRonda } = await db.from('turnos').select('jugador_orador_id').eq('sala_id', salaActual.id).eq('numero_ronda', salaActual.ronda_actual);
    const jugaronIds = tRonda ? tRonda.map(t => t.jugador_orador_id) : [];
    let candidatos = jugadoresEnSala.filter(j => !jugaronIds.includes(j.id));
    if (candidatos.length === 0) candidatos = jugadoresEnSala;

    const orador = candidatos[Math.floor(Math.random() * candidatos.length)];
    const adivinador = jugadoresEnSala.find(j => j.id !== orador.id) || orador;

    let q = db.from('mazo_palabras').select('id');
    // Aplica el filtro de categoría configurado en la sala
    if (salaActual.categoria_id) q = q.eq('categoria', salaActual.categoria_id);
    
    const { data: pals } = await q;
    if (!pals || pals.length === 0) return alert("No hay palabras en la categoría seleccionada.");
    const palabra = pals[Math.floor(Math.random() * pals.length)];

    // Aplica el tiempo por ronda configurado en la sala
    const terminaAt = new Date(Date.now() + (salaActual.tiempo_ronda * 1000)).toISOString();

    await db.from('turnos').insert([{
        sala_id: salaActual.id, jugador_orador_id: orador.id, jugador_adivinador_id: adivinador.id,
        palabra_actual_id: palabra.id, termina_at: terminaAt, estado: 'activo', numero_ronda: salaActual.ronda_actual
    }]);
}

async function configurarPantallaSegunRol(turno) {
    const orador = jugadoresEnSala.find(j => j.id === turno.jugador_orador_id);
    txtTurnoDe.innerText = orador ? orador.nombre : "";
    [vistaOrador, vistaAdivinador, vistaControlador, bloqueBotonesOrador].forEach(v => v.classList.add('hidden'));

    if (miUsuario.id === turno.jugador_orador_id) {
        txtRol.innerText = "Tu Rol: Orador 🎙️";
        vistaOrador.classList.remove('hidden');
        bloqueBotonesOrador.classList.remove('hidden');
        
        btnSaltar.innerText = `Saltar (${saltosRestantes})`;

        const { data: p } = await db.from('mazo_palabras').select('*').eq('id', turno.palabra_actual_id).single();
        if (p) {
            palabraActualTexto = p.palabra_principal;
            elPalabraPrincipal.innerText = p.palabra_principal;
            elListaProhibidas.innerHTML = p.palabras_prohibidas.map(pt => `<li class="p-2 bg-slate-800 rounded">${pt}</li>`).join('');
        }
    } else if (miUsuario.id === turno.jugador_adivinador_id) {
        txtRol.innerText = "Tu Rol: Adivinar 🧠";
        vistaAdivinador.classList.remove('hidden');
    } else {
        txtRol.innerText = "Tu Rol: Vigilante 👀";
        vistaControlador.classList.remove('hidden');
    }
}

function sincronizarCronometro(finStr, turnoId) {
    if (intervaloCronometro) clearInterval(intervaloCronometro);
    const fin = new Date(finStr).getTime();
    intervaloCronometro = setInterval(async () => {
        const rest = Math.ceil((fin - Date.now()) / 1000);
        txtCronometro.innerText = rest <= 0 ? 0 : rest;
        if (rest <= 0) {
            clearInterval(intervaloCronometro);
            if (miUsuario.id === turnoActualDatos.jugador_orador_id) {
                await db.from('turnos').update({ estado: 'resumen' }).eq('id', turnoId);
            }
        }
    }, 1000);
}

async function cambiarPalabra() {
    let q = db.from('mazo_palabras').select('id, palabra_principal');
    if (salaActual.categoria_id) q = q.eq('categoria', salaActual.categoria_id);
    const { data: pals } = await q;
    let disp = pals.filter(p => !palabrasUsadasEnTurno.includes(p.palabra_principal));
    if (disp.length === 0) disp = pals;
    const sel = disp[Math.floor(Math.random() * disp.length)];
    palabrasUsadasEnTurno.push(sel.palabra_principal);
    await db.from('turnos').update({ palabra_actual_id: sel.id }).eq('id', turnoActualId);
}

// BOTONES DE ACCIÓN EN JUEGO
btnAcierto.addEventListener('click', async () => {
    if (procesandoAccion) return; procesandoAccion = true;
    let list = [...(turnoActualDatos.palabras_acertadas || []), palabraActualTexto];
    await db.from('turnos').update({ palabras_acertadas: list }).eq('id', turnoActualId);
    await actualizarPuntos(miUsuario.id, 1);
    await cambiarPalabra();
    procesandoAccion = false;
});

btnSaltar.addEventListener('click', async () => {
    if (procesandoAccion || saltosRestantes <= 0) return; procesandoAccion = true;
    saltosRestantes--;
    btnSaltar.innerText = `Saltar (${saltosRestantes})`;
    
    let list = [...(turnoActualDatos.palabras_saltadas || []), palabraActualTexto];
    await db.from('turnos').update({ palabras_saltadas: list }).eq('id', turnoActualId);
    await cambiarPalabra();
    procesandoAccion = false;
});

btnTabu.addEventListener('click', async () => {
    if (procesandoAccion) return; procesandoAccion = true;
    let list = [...(turnoActualDatos.palabras_tabu || []), palabraActualTexto];
    await db.from('turnos').update({ palabras_tabu: list }).eq('id', turnoActualId);
    await actualizarPuntos(miUsuario.id, -1);
    await cambiarPalabra();
    procesandoAccion = false;
});

// PANTALLAS DE RESUMEN
function mostrarResumenTurno(turno) {
    if (intervaloCronometro) clearInterval(intervaloCronometro);
    alternarPantalla(pantallas.resumenTurno);
    
    // Mostramos el nombre del orador
    txtResumenOrador.innerText = jugadoresEnSala.find(j => j.id === turno.jugador_orador_id)?.nombre || "";
    
    // Pintamos las 3 listas
    listaResumenAcertadas.innerHTML = (turno.palabras_acertadas || []).map(p => `<li>✅ ${p}</li>`).join('') || '<li>-</li>';
    listaResumenSaltadas.innerHTML = (turno.palabras_saltadas || []).map(p => `<li>➡️ ${p}</li>`).join('') || '<li>-</li>';
    
    // ¡AQUÍ ESTABA EL ERROR! Ya inyecta la variable ${p} correctamente
    listaResumenTabu.innerHTML = (turno.palabras_tabu || []).map(p => `<li>🚨 ${p}</li>`).join('') || '<li>-</li>';
    
    // Mostramos el botón de continuar solo al anfitrión
    btnContinuarTurno.classList.toggle('hidden', !miUsuario.es_anfitrion);
}

btnContinuarTurno.addEventListener('click', async () => {
    const { data: tRonda } = await db.from('turnos').select('jugador_orador_id').eq('sala_id', salaActual.id).eq('numero_ronda', salaActual.ronda_actual);
    const jugaronIds = tRonda.map(t => t.jugador_orador_id);
    if (jugadoresEnSala.every(j => jugaronIds.includes(j.id))) {
        await db.from('salas').update({ estado: 'resumen_ronda' }).eq('id', salaActual.id);
    } else {
        await iniciarNuevoTurno();
    }
});

async function mostrarResumenRonda() {
    alternarPantalla(pantallas.resumenRonda);
    txtNumeroRondaFin.innerText = salaActual.ronda_actual;
    const { data: jugs } = await db.from('jugadores').select('*').eq('sala_id', salaActual.id).order('puntos', { ascending: false });
    tablaPosiciones.innerHTML = jugs.map((j, i) => `<tr><td class="p-2">${i+1}</td><td class="p-2">${j.nombre}</td><td class="p-2 text-right">${j.puntos}</td></tr>`).join('');
    if (miUsuario.es_anfitrion) {
        btnSiguienteRonda.classList.remove('hidden');
        // Evalúa el límite máximo de rondas configurado dinámicamente en la sala
        btnSiguienteRonda.innerText = salaActual.ronda_actual >= salaActual.max_rondas ? "Finalizar Partida 🏆" : "Siguiente Ronda 🚀";
    }
}

btnSiguienteRonda.addEventListener('click', async () => {
    if (salaActual.ronda_actual >= salaActual.max_rondas) {
        await db.from('salas').update({ estado: 'esperando', ronda_actual: 1 }).eq('id', salaActual.id);
        window.location.reload();
    } else {
        await db.from('salas').update({ ronda_actual: salaActual.ronda_actual + 1, estado: 'jugando' }).eq('id', salaActual.id);
        await iniciarNuevoTurno();
    }
});