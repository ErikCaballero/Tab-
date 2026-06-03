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

// Variables de Corrección
let palabraEnCorreccion = null;
let tipoListaCorreccion = null; // 'acertadas' o 'saltadas'

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

// Elementos del Explorador de Salas Abiertas
const contenedorSalasAbiertas = document.getElementById('contenedor-salas-abiertas');
const btnActualizarSalas = document.getElementById('btn-actualizar-salas');

// Inputs de Ajustes y Nuevo Desplegable Múltiple
const btnCategoriaMenu = document.getElementById('btn-categoria-menu');
const txtCategoriasSeleccionadas = document.getElementById('txt-categorias-seleccionadas');
const dropdownCategorias = document.getElementById('dropdown-categorias');
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
const txtInfoHostCorr = document.getElementById('txt-info-host-corr');
const listaResumenAcertadas = document.getElementById('lista-resumen-acertadas');
const listaResumenSaltadas = document.getElementById('lista-resumen-saltadas');
const listaResumenTabu = document.getElementById('lista-resumen-tabu');
const btnContinuarTurno = document.getElementById('btn-continuar-turno');
const txtNumeroRondaFin = document.getElementById('txt-numero-ronda-fin');
const tablaPosiciones = document.getElementById('tabla-posiciones');
const btnSiguienteRonda = document.getElementById('btn-siguiente-ronda');

// Modal Corrección
const btnAplicarTabu = document.getElementById('btn-aplicar-tabu');

// =========================================================================
// 3. LÓGICA DE PANEL DE CONTROL / CONFIGURACIÓN (MULTISELECCIÓN)
// =========================================================================

function alternarPantalla(pantallaVisible) {
    Object.values(pantallas).forEach(p => p.classList.add('hidden'));
    pantallaVisible.classList.remove('hidden');
}

btnCategoriaMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownCategorias.classList.toggle('hidden');
});

document.addEventListener('click', () => {
    dropdownCategorias.classList.add('hidden');
});

dropdownCategorias.addEventListener('click', (e) => {
    e.stopPropagation(); 
});

async function cargarCategoriasOpciones() {
    const { data } = await db.from('mazo_palabras').select('categoria');
    dropdownCategorias.innerHTML = '';
    
    if (data) {
        const categoriasUnicas = [...new Set(data.map(item => item.categoria).filter(Boolean))];
        categoriasUnicas.forEach(cat => {
            const label = document.createElement('label');
            label.className = "flex items-center gap-2 p-2 hover:bg-slate-700/60 rounded-lg cursor-pointer text-xs font-semibold w-full text-left transition select-none text-slate-200";
            
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.value = cat;
            chk.className = 'chk-categoria rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-800 focus:ring-1 trend-transform';
            
            chk.addEventListener('change', registrarCambioAjustes);

            const span = document.createElement('span');
            span.innerText = cat;

            label.appendChild(chk);
            label.appendChild(span);
            dropdownCategorias.appendChild(label);
        });
    }
}

async function registrarCambioAjustes() {
    if (!miUsuario || !miUsuario.es_anfitrion || !salaActual) return;
    
    const checkboxes = dropdownCategorias.querySelectorAll('.chk-categoria');
    const seleccionadas = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
    
    const valorCategoria = (seleccionadas.length === 0 || seleccionadas.length === checkboxes.length) 
        ? null 
        : seleccionadas.join(',');
    
    const { error } = await db.from('salas').update({
        tiempo_ronda: parseInt(inputTiempo.value) || 60,
        max_rondas: parseInt(inputRondas.value) || 3,
        max_saltos: parseInt(inputSaltos.value) || 3,
        categoria_id: valorCategoria 
    }).eq('id', salaActual.id);

    if (error) console.error("Error guardando ajustes:", error);
}

[inputTiempo, inputRondas, inputSaltos].forEach(el => {
    el.addEventListener('input', registrarCambioAjustes);
});

function aplicarAjustesEnUI(sala) {
    const esAnfitrion = miUsuario && miUsuario.es_anfitrion;
    
    inputTiempo.disabled = !esAnfitrion;
    inputRondas.disabled = !esAnfitrion;
    inputSaltos.disabled = !esAnfitrion;

    inputTiempo.value = sala.tiempo_ronda;
    inputRondas.value = sala.max_rondas;
    inputSaltos.value = sala.max_saltos;

    const checkboxes = dropdownCategorias.querySelectorAll('.chk-categoria');
    if (checkboxes.length > 0) {
        if (!sala.categoria_id) {
            checkboxes.forEach(c => {
                c.checked = true;
                c.disabled = !esAnfitrion;
            });
            txtCategoriasSeleccionadas.innerText = "✨ Todas las categorías";
        } else {
            const seleccionadas = sala.categoria_id.split(',');
            checkboxes.forEach(c => {
                c.checked = seleccionadas.includes(c.value);
                c.disabled = !esAnfitrion; 
            });

            if (seleccionadas.length === 1) {
                txtCategoriasSeleccionadas.innerText = `📂 ${seleccionadas[0]}`;
            } else {
                txtCategoriasSeleccionadas.innerText = `📂 ${seleccionadas.length} cat. activas`;
            }
        }
    }
}

// =========================================================================
// 4. LÓGICA DE EXPLORACIÓN DE SALAS EXISTENTES
// =========================================================================
async function cargarSalasDisponibles() {
    contenedorSalasAbiertas.innerHTML = '<p class="text-slate-500 text-center py-2">Buscando salas...</p>';
    
    const { data: salas, error } = await db.from('salas').select('*').order('id', { ascending: false });
    
    if (error || !salas || salas.length === 0) {
        contenedorSalasAbiertas.innerHTML = '<p class="text-slate-500 text-center py-2">No hay salas creadas en el servidor.</p>';
        return;
    }
    
    contenedorSalasAbiertas.innerHTML = '';
    salas.forEach(sala => {
        const item = document.createElement('div');
        item.className = "flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition animate-fade-in";
        
        let badgeStyle = "bg-slate-700 text-slate-300";
        let badgeTexto = sala.estado;
        
        if (sala.estado === 'esperando') {
            badgeStyle = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
            badgeTexto = "⏳ Esperando";
        } else if (sala.estado === 'jugando') {
            badgeStyle = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
            badgeTexto = "🎮 En Juego";
        } else if (sala.estado === 'resumen_ronda') {
            badgeStyle = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
            badgeTexto = "🏆 Fin Ronda";
        }
        
        item.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="font-mono font-bold tracking-widest text-indigo-400 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-sm">${sala.codigo}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md ${badgeStyle}">${badgeTexto}</span>
            </div>
            <button class="btn-acceso-directo bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold px-3 py-1 rounded-lg transition tracking-wide text-[11px]" data-codigo="${sala.codigo}">
                Entrar
            </button>
        `;
        
        item.querySelector('.btn-acceso-directo').addEventListener('click', (e) => {
            const nombre = inputNombre.value.trim();
            if (!nombre) return alert("Por favor, introduce tu nombre primero (arriba) antes de unirte.");
            
            inputCodigo.value = e.target.getAttribute('data-codigo');
            btnUnirse.click();
        });
        
        contenedorSalasAbiertas.appendChild(item);
    });
}

btnActualizarSalas.addEventListener('click', cargarSalasDisponibles);

// =========================================================================
// 5. CREACIÓN, UNIÓN Y ABANDONO DE SALA
// =========================================================================

btnCrear.addEventListener('click', async () => {
    const nombre = inputNombre.value.trim();
    if (!nombre) return alert("Introduce tu nombre");
    
    await cargarCategoriasOpciones();
    const codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
    
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

// NUEVO: Función Global de Abandono (Destruye la sala si te vas y queda vacía)
window.abandonarSala = async function() {
    if (!salaActual || !miUsuario) return;
    
    if (!confirm("¿Estás seguro de que quieres salir de la partida?")) return;

    // 1. Borrar al propio jugador de la tabla
    await db.from('jugadores').delete().eq('id', miUsuario.id);

    // 2. Comprobar cuántos quedan
    const { count, error } = await db.from('jugadores').select('*', { count: 'exact', head: true }).eq('sala_id', salaActual.id);
    
    if (count === 0) {
        // 3a. La sala está vacía -> Eliminar la sala por completo
        await db.from('salas').delete().eq('id', salaActual.id);
    } else if (miUsuario.es_anfitrion) {
        // 3b. La sala NO está vacía pero el que se va es el Host -> Asignar el puesto al jugador más veterano
        const { data: restantes } = await db.from('jugadores').select('*').eq('sala_id', salaActual.id).order('creado_en', { ascending: true }).limit(1);
        if (restantes && restantes.length > 0) {
            await db.from('jugadores').update({ es_anfitrion: true }).eq('id', restantes[0].id);
        }
    }

    // Recargar página para limpiar toda la RAM y volver al inicio
    window.location.reload();
};

// =========================================================================
// 6. LOBBY Y REALTIME (SINCRONIZACIÓN Y EXPULSIÓN DE JUGADORES)
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

window.expulsarJugador = async function(idJugadorAExpulsar) {
    if (!miUsuario.es_anfitrion) return;
    if (confirm("¿Estás seguro de que deseas expulsar a este jugador de la sala?")) {
        const { error } = await db.from('jugadores').delete().eq('id', idJugadorAExpulsar);
        if (error) {
            console.error(error);
            alert("Error al expulsar al jugador.");
        } else {
            actualizarListaJugadoresDeBaseDatos();
        }
    }
};

async function actualizarListaJugadoresDeBaseDatos() {
    const { data: jugadores } = await db.from('jugadores')
        .select('*').eq('sala_id', salaActual.id).order('creado_en', { ascending: true });
    
    jugadoresEnSala = jugadores || [];

    // Verificación de si te han expulsado u otra persona se fue
    if (miUsuario && !jugadoresEnSala.find(j => j.id === miUsuario.id)) {
        alert("Ya no formas parte de la sala.");
        window.location.reload();
        return;
    }

    // Sincronizar mis privilegios por si me heredaron el Host al irse el antiguo creador
    const misDatosNuevos = jugadoresEnSala.find(j => j.id === miUsuario.id);
    if (misDatosNuevos) miUsuario.es_anfitrion = misDatosNuevos.es_anfitrion;

    // Reactivar el botón de Empezar Partida para el nuevo host si le heredaron el poder
    if (miUsuario.es_anfitrion && salaActual.estado === 'esperando') {
        btnEmpezar.classList.remove('hidden');
        aplicarAjustesEnUI(salaActual); // Desbloquea inputs si acaba de recibir host
    }

    listaJugadoresUI.innerHTML = jugadoresEnSala.map(j => `
        <li class="bg-slate-700/80 p-3 rounded-xl flex justify-between items-center text-sm font-semibold">
            <span class="flex items-center gap-2">
                ${j.nombre} ${j.es_anfitrion ? '👑' : ''}
            </span>
            <div class="flex items-center gap-3">
                <span class="text-indigo-300">${j.puntos || 0} pts</span>
                ${(miUsuario.es_anfitrion && j.id !== miUsuario.id) ? 
                    `<button onclick="expulsarJugador('${j.id}')" class="bg-rose-950/60 text-rose-400 hover:text-rose-200 hover:bg-rose-900 transition px-2 py-1 rounded-lg text-xs" title="Expulsar jugador">❌</button>` 
                : ''}
            </div>
        </li>
    `).join('');
}

function activarMonitoreoRealtime() {
    db.channel(`sala-${salaActual.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'salas', filter: `id=eq.${salaActual.id}` }, 
            (payload) => {
                salaActual = payload.new;
                aplicarAjustesEnUI(salaActual);
                
                if (salaActual.estado === 'jugando') alternarPantalla(pantallas.juego);
                if (salaActual.estado === 'resumen_ronda') mostrarResumenRonda();
            }
        ).subscribe();

    db.channel(`jugadores-${salaActual.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jugadores', filter: `sala_id=eq.${salaActual.id}` }, () => actualizarListaJugadoresDeBaseDatos())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jugadores', filter: `sala_id=eq.${salaActual.id}` }, () => actualizarListaJugadoresDeBaseDatos())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'jugadores' }, () => actualizarListaJugadoresDeBaseDatos()) 
        .subscribe();

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

    if (salaActual.estado === 'jugando' || salaActual.estado === 'resumen_ronda') {
        fetchTurnoActualInicial();
    }
}

async function fetchTurnoActualInicial() {
    const { data: turnos } = await db.from('turnos')
        .select('*')
        .eq('sala_id', salaActual.id)
        .order('id', { ascending: false })
        .limit(1);
        
    if (turnos && turnos.length > 0) {
        const turno = turnos[0];
        turnoActualDatos = turno;
        turnoActualId = turno.id;
        saltosRestantes = salaActual.max_saltos;
        
        if (turno.estado === 'resumen') {
            mostrarResumenTurno(turno);
        } else {
            sincronizarCronometro(turno.termina_at, turno.id);
            alternarPantalla(pantallas.juego);
            configurarPantallaSegunRol(turno);
        }
    }
}

// =========================================================================
// 7. MOTOR DE JUEGO
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
    
    if (salaActual.categoria_id) {
        const cats = salaActual.categoria_id.split(',');
        q = q.in('categoria', cats);
    }
    
    const { data: pals } = await q;
    if (!pals || pals.length === 0) return alert("No hay palabras en las categorías seleccionadas.");
    const palabra = pals[Math.floor(Math.random() * pals.length)];

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
    
    if (salaActual.categoria_id) {
        const cats = salaActual.categoria_id.split(',');
        q = q.in('categoria', cats);
    }
    
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

// =========================================================================
// 8. PANTALLAS DE RESUMEN Y CORRECCIÓN HOST
// =========================================================================

// Lógica del modal de corrección
window.abrirModalCorreccion = async function(palabra, listaOrigen) {
    if (!miUsuario.es_anfitrion) return; 
    
    palabraEnCorreccion = palabra;
    tipoListaCorreccion = listaOrigen;

    document.getElementById('modal-corr-palabra').innerText = palabra;
    document.getElementById('modal-corr-prohibidas').innerHTML = '<li class="text-slate-500 italic">Buscando tarjeta...</li>';
    document.getElementById('modal-correccion').classList.remove('hidden');

    const { data } = await db.from('mazo_palabras').select('palabras_prohibidas').eq('palabra_principal', palabra).single();
    if (data && data.palabras_prohibidas) {
        document.getElementById('modal-corr-prohibidas').innerHTML = data.palabras_prohibidas.map(p => `<li>${p}</li>`).join('');
    } else {
        document.getElementById('modal-corr-prohibidas').innerHTML = '<li class="text-slate-500 italic">No se encontraron.</li>';
    }
};

window.cerrarModalCorreccion = function() {
    document.getElementById('modal-correccion').classList.add('hidden');
    palabraEnCorreccion = null;
    tipoListaCorreccion = null;
};

btnAplicarTabu.addEventListener('click', async () => {
    if (!palabraEnCorreccion || !tipoListaCorreccion || !turnoActualDatos) return;
    
    const t = turnoActualDatos;
    let listaAcertadas = [...(t.palabras_acertadas || [])];
    let listaSaltadas = [...(t.palabras_saltadas || [])];
    let listaTabu = [...(t.palabras_tabu || [])];

    if (tipoListaCorreccion === 'acertadas') {
        listaAcertadas = listaAcertadas.filter(p => p !== palabraEnCorreccion);
        await actualizarPuntos(t.jugador_orador_id, -2);
    } else if (tipoListaCorreccion === 'saltadas') {
        listaSaltadas = listaSaltadas.filter(p => p !== palabraEnCorreccion);
        await actualizarPuntos(t.jugador_orador_id, -1);
    }

    listaTabu.push(palabraEnCorreccion);

    await db.from('turnos').update({
        palabras_acertadas: listaAcertadas,
        palabras_saltadas: listaSaltadas,
        palabras_tabu: listaTabu
    }).eq('id', t.id);

    cerrarModalCorreccion();
});

// Renderizado de Resumen
function mostrarResumenTurno(turno) {
    if (intervaloCronometro) clearInterval(intervaloCronometro);
    alternarPantalla(pantallas.resumenTurno);
    
    txtResumenOrador.innerText = jugadoresEnSala.find(j => j.id === turno.jugador_orador_id)?.nombre || "";
    
    txtInfoHostCorr.classList.toggle('hidden', !miUsuario.es_anfitrion);
    const claseClick = miUsuario.es_anfitrion ? "bg-slate-900 cursor-pointer hover:bg-slate-700 border border-transparent hover:border-indigo-500 transition shadow-sm" : "bg-slate-900";
    const tituloClick = miUsuario.es_anfitrion ? " title='Clic para ver tarjeta y corregir'" : "";
    
    listaResumenAcertadas.innerHTML = (turno.palabras_acertadas || []).map(p => 
        `<li class="p-3 rounded-xl text-sm text-slate-300 font-medium flex items-center ${claseClick}" ${tituloClick} onclick="abrirModalCorreccion('${p}', 'acertadas')">✅ <span class="ml-2">${p}</span></li>`
    ).join('') || '<li class="text-slate-500 italic p-2">Ninguna</li>';

    listaResumenSaltadas.innerHTML = (turno.palabras_saltadas || []).map(p => 
        `<li class="p-3 rounded-xl text-sm text-slate-400 font-medium flex items-center ${claseClick}" ${tituloClick} onclick="abrirModalCorreccion('${p}', 'saltadas')">➡️ <span class="ml-2">${p}</span></li>`
    ).join('') || '<li class="text-slate-500 italic p-2">Ninguna</li>';

    listaResumenTabu.innerHTML = (turno.palabras_tabu || []).map(p => 
        `<li class="bg-slate-900/60 p-3 rounded-xl text-sm text-rose-300 font-medium flex items-center">🚨 <span class="ml-2">${p}</span></li>`
    ).join('') || '<li class="text-slate-500 italic p-2">Ninguno</li>';
    
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
    tablaPosiciones.innerHTML = jugs.map((j, i) => `<tr><td class="p-2">${i+1}</td><td class="p-2">${j.nombre}</td><td class="p-2 text-right font-bold text-indigo-300">${j.puntos}</td></tr>`).join('');
    if (miUsuario.es_anfitrion) {
        btnSiguienteRonda.classList.remove('hidden');
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

// INITIALIZATION ENTRYPOINT
cargarSalasDisponibles();