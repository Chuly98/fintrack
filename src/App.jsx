import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { supabase } from './supabaseClient';

const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

const ACTIVOS_POPULARES = [
  { ticker: 'AAPL', nombre: 'Apple Inc.', tipo: 'Acción' },
  { ticker: 'NVDA', nombre: 'NVIDIA Corporation', tipo: 'Acción' },
  { ticker: 'TSLA', nombre: 'Tesla Inc.', tipo: 'Acción' },
  { ticker: 'MSFT', nombre: 'Microsoft Corporation', tipo: 'Acción' },
  { ticker: 'AMZN', nombre: 'Amazon.com Inc.', tipo: 'Acción' },
  { ticker: 'SPY', nombre: 'SPDR S&P 500 ETF Trust', tipo: 'ETF' },
  { ticker: 'QQQ', nombre: 'Invesco QQQ Trust (Nasdaq 100)', tipo: 'ETF' },
  { ticker: 'BINANCE:BTCUSDT', tickerDisplay: 'BTC', nombre: 'Bitcoin / USDT', tipo: 'Cripto' },
  { ticker: 'BINANCE:ETHUSDT', tickerDisplay: 'ETH', nombre: 'Ethereum / USDT', tipo: 'Cripto' },
];

function App() {
  // --- AUTENTICACIÓN SUPABASE ---
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [modoAuth, setModoAuth] = useState('login');
  const [formAuth, setFormAuth] = useState({ nombre: '', email: '', password: '' });
  const [errorAuth, setErrorAuth] = useState('');
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [tabActiva, setTabActiva] = useState('portafolio');
  const [cargandoPrecios, setCargandoPrecios] = useState(false);

  // --- PORTAFOLIO Y CAJA (ESTADOS CON SUPABASE) ---
  const [saldoCaja, setSaldoCaja] = useState(0);
  const [posiciones, setPosiciones] = useState([]);
  const [historialPatrimonio, setHistorialPatrimonio] = useState([]);

  // --- SIMULADOR DE INTERÉS COMPUESTO ---
  const [simInicial, setSimInicial] = useState(1000);
  const [simMensual, setSimMensual] = useState(200);
  const [simAnios, setSimAnios] = useState(10);
  const [simTasa, setSimTasa] = useState(10);
  const [simVarianza, setSimVarianza] = useState('');
  const [simFrecuencia, setSimFrecuencia] = useState(12);
  const [simResultados, setSimResultados] = useState(null);
  const [mostrarTabla, setMostrarTabla] = useState(false);

  // --- MODALES Y FORMULARIOS ---
  const [inputDeposito, setInputDeposito] = useState('');
  const [mostrarModalCaja, setMostrarModalCaja] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [activoEditandoId, setActivoEditandoId] = useState(null);
  const [errorCaja, setErrorCaja] = useState('');
  const [nuevoActivo, setNuevoActivo] = useState({
    ticker: '', nombre: '', tipo: 'Acción', cant: '', precioCompra: '', notas: ''
  });
  const [sugerencias, setSugerencias] = useState([]);
  const [buscandoTickerAPI, setBuscandoTickerAPI] = useState(false);
  const [obteniendoPrecioAPI, setObteniendoPrecioAPI] = useState(false);

  // -------------------------------------------------------------
  // 1. CARGA DE DATOS Y ESCUCHADOR DE SESIÓN CON SUPABASE
  // -------------------------------------------------------------
  useEffect(() => {
    // Comprobar sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUsuarioActual({
          id: session.user.id,
          email: session.user.email,
          nombre: session.user.user_metadata?.nombre || session.user.email.split('@')[0]
        });
        cargarDatosUsuario(session.user.id);
      } else {
        setUsuarioActual(null);
      }
      setCargandoAuth(false);
    });

    // Escuchar cambios de estado en autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUsuarioActual({
          id: session.user.id,
          email: session.user.email,
          nombre: session.user.user_metadata?.nombre || session.user.email.split('@')[0]
        });
        cargarDatosUsuario(session.user.id);
      } else {
        setUsuarioActual(null);
        setSaldoCaja(0);
        setPosiciones([]);
        setHistorialPatrimonio([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const cargarDatosUsuario = async (userId) => {
    try {
      // Cargar Perfil (Caja e Historial)
      const { data: perfil, error: errPerfil } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (errPerfil) console.error("Error al cargar perfil:", errPerfil.message);

      if (perfil) {
        setSaldoCaja(parseFloat(perfil.saldo_caja) || 0);
        setHistorialPatrimonio(perfil.historial_patrimonio || []);
      } else {
        // Si no existe perfil, crearlo
        await supabase.from('perfiles').insert([
          { id: userId, nombre: usuarioActual?.nombre || 'Inversor', saldo_caja: 0, historial_patrimonio: [] }
        ]);
      }

      // Cargar Posiciones
      const { data: posData, error: errPos } = await supabase
        .from('posiciones')
        .select('*')
        .eq('user_id', userId);

      if (errPos) {
        console.error("Error al cargar posiciones:", errPos.message);
      } else if (posData) {
        const formateadas = posData.map(p => ({
          id: p.id,
          ticker: p.ticker,
          nombre: p.nombre,
          tipo: p.tipo,
          cant: parseFloat(p.cant),
          precioCompra: parseFloat(p.precio_compra),
          precioActual: parseFloat(p.precio_compra), // Inicialmente igual hasta actualizar con API
          cambioDiarioPct: 0,
          cambioDiarioUSD: 0,
          notas: p.notas || ''
        }));
        setPosiciones(formateadas);
      }
    } catch (e) {
      console.error("Error global al cargar datos:", e);
    }
  };

  // Guardar cambios de caja en Supabase
  const actualizarSaldoCajaBaseDatos = async (nuevoSaldo) => {
    if (!usuarioActual) return;
    setSaldoCaja(nuevoSaldo);
    await supabase.from('perfiles').update({ saldo_caja: nuevoSaldo }).eq('id', usuarioActual.id);
  };

  // -------------------------------------------------------------
  // 2. HANDLERS DE AUTENTICACIÓN CON SUPABASE
  // -------------------------------------------------------------
  const handleRegistroSubmit = async (e) => {
    e.preventDefault();
    setErrorAuth('');
    const { data, error } = await supabase.auth.signUp({
      email: formAuth.email,
      password: formAuth.password,
      options: { data: { nombre: formAuth.nombre } }
    });

    if (error) {
      setErrorAuth(error.message);
      return;
    }

    if (data.user) {
      await supabase.from('perfiles').insert([
        { id: data.user.id, nombre: formAuth.nombre, saldo_caja: 0, historial_patrimonio: [] }
      ]);
      setFormAuth({ nombre: '', email: '', password: '' });
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorAuth('');
    const { error } = await supabase.auth.signInWithPassword({
      email: formAuth.email,
      password: formAuth.password,
    });

    if (error) {
      setErrorAuth('Correo o contraseña incorrectos.');
    } else {
      setFormAuth({ nombre: '', email: '', password: '' });
    }
  };

  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  // -------------------------------------------------------------
  // 3. SIMULADOR DE INTERÉS COMPUESTO
  // -------------------------------------------------------------
  const handleCalcular = (e) => {
    if (e) e.preventDefault();
    let datos = [];
    let capital = parseFloat(simInicial) || 0;
    let aporte = parseFloat(simMensual) || 0;
    let tasa = parseFloat(simTasa) || 0;
    let varz = parseFloat(simVarianza) || 0;
    let n = parseInt(simFrecuencia) || 1;
    let anios = parseInt(simAnios) || 10;

    let rExp = tasa / 100;
    let rOpt = (tasa + varz) / 100;
    let rPes = (tasa - varz) / 100;

    datos.push({ year: 'Año 0', aportes: capital, esperado: capital, optimista: capital, pesimista: capital });

    for (let y = 1; y <= anios; y++) {
      let aportesTotales = capital + (aporte * 12 * y);
      const calcFV = (r, n_freq) => {
        if (r === 0) return aportesTotales;
        let fvPrincipal = capital * Math.pow(1 + r / n_freq, y * n_freq);
        let pmt_period = (n_freq === 1) ? (aporte * 12) : (n_freq === 12 ? aporte : aporte * (12 / n_freq));
        let fvAportes = pmt_period * ((Math.pow(1 + r / n_freq, y * n_freq) - 1) / (r / n_freq));
        return fvPrincipal + fvAportes;
      };

      datos.push({
        year: `Año ${y}`,
        aportes: Math.round(calcFV(0, n)),
        esperado: Math.round(calcFV(rExp, n)),
        optimista: varz > 0 ? Math.round(calcFV(rOpt, n)) : null,
        pesimista: varz > 0 ? Math.round(calcFV(rPes, n)) : null
      });
    }
    setSimResultados(datos);
    setMostrarTabla(false);
  };

  const handleRestablecer = () => {
    setSimInicial(1000); setSimMensual(200); setSimAnios(10);
    setSimTasa(10); setSimVarianza(''); setSimFrecuencia(12);
    setSimResultados(null); setMostrarTabla(false);
  };

  // -------------------------------------------------------------
  // 4. ACCIONES DE CAJA Y REINICIO
  // -------------------------------------------------------------
  const handleIngresarCapital = async (e) => {
    e.preventDefault();
    const monto = parseFloat(inputDeposito.toString().replace(',', '.'));
    if (isNaN(monto) || monto <= 0) return;
    const nuevoSaldo = saldoCaja + monto;
    await actualizarSaldoCajaBaseDatos(nuevoSaldo);
    setInputDeposito('');
    setMostrarModalCaja(false);
  };

  const handleResetearCaja = async () => {
    if (window.confirm("¿Estás seguro de que deseas vaciar tu dinero en caja a $0.00?")) {
      await actualizarSaldoCajaBaseDatos(0);
    }
  };

  const handleResetearPortafolioCompleto = async () => {
    if (window.confirm("⚠️ ¿Deseas reiniciar completamente tu cuenta? Se eliminarán todas tus posiciones, tu caja e historial de patrimonio.")) {
      if (!usuarioActual) return;
      await supabase.from('posiciones').delete().eq('user_id', usuarioActual.id);
      await supabase.from('perfiles').update({ saldo_caja: 0, historial_patrimonio: [] }).eq('id', usuarioActual.id);
      setSaldoCaja(0);
      setPosiciones([]);
      setHistorialPatrimonio([]);
    }
  };

  // -------------------------------------------------------------
  // 5. ACTUALIZAR PRECIOS FINNHUB & SNAPSHOT HISTÓRICO
  // -------------------------------------------------------------
  const actualizarPreciosDesdeBolsa = async () => {
    if (!API_KEY || !usuarioActual) return;
    setCargandoPrecios(true);
    try {
      let posicionesActuales = posiciones;
      if (posiciones.length > 0) {
        posicionesActuales = await Promise.all(
          posiciones.map(async (pos) => {
            if (pos.tipo === 'Renta Fija') return pos;
            try {
              const respuesta = await fetch(`https://finnhub.io/api/v1/quote?symbol=${pos.ticker}&token=${API_KEY}`);
              const datos = await respuesta.json();
              if (datos && datos.c && datos.c > 0) {
                return {
                  ...pos,
                  precioActual: datos.c,
                  cambioDiarioPct: datos.dp || 0,
                  cambioDiarioUSD: datos.d || 0
                };
              }
            } catch (error) { console.error(error); }
            return pos;
          })
        );
        setPosiciones(posicionesActuales);
      }

      // Snapshot diario
      let sumaInversiones = 0;
      posicionesActuales.forEach(p => { sumaInversiones += p.cant * p.precioActual; });
      const totalHoy = saldoCaja + sumaInversiones;
      const hoyStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

      let nuevoHistorial = [...historialPatrimonio];
      const indiceHoy = nuevoHistorial.findIndex(item => item.fecha === hoyStr);
      if (indiceHoy >= 0) {
        nuevoHistorial[indiceHoy] = { fecha: hoyStr, valor: Math.round(totalHoy * 100) / 100 };
      } else {
        nuevoHistorial.push({ fecha: hoyStr, valor: Math.round(totalHoy * 100) / 100 });
        nuevoHistorial = nuevoHistorial.slice(-14);
      }
      setHistorialPatrimonio(nuevoHistorial);

      // Guardar historial en Supabase
      await supabase.from('perfiles').update({ historial_patrimonio: nuevoHistorial }).eq('id', usuarioActual.id);

    } catch (error) { console.error(error); } finally { setCargandoPrecios(false); }
  };

  useEffect(() => {
    if (!usuarioActual) return;
    actualizarPreciosDesdeBolsa();
    const temporizador = setInterval(() => actualizarPreciosDesdeBolsa(), 30000);
    return () => clearInterval(temporizador);
  }, [posiciones.length, saldoCaja, usuarioActual]);

  // -------------------------------------------------------------
  // 6. OPERACIONES DE MERCADO Y SUPABASE (COMPRAR / EDITAR / ELIMINAR)
  // -------------------------------------------------------------
  const buscarSimboloEnBolsa = async (query) => {
    if (!query || query.length < 2 || !API_KEY) {
      setSugerencias([]);
      return;
    }
    setBuscandoTickerAPI(true);
    try {
      const respuesta = await fetch(`https://finnhub.io/api/v1/search?q=${query}&token=${API_KEY}`);
      const datos = await respuesta.json();
      if (datos && datos.result) {
        setSugerencias(datos.result.slice(0, 6));
      }
    } catch (error) {
      console.error("Error buscando símbolo:", error);
    } finally {
      setBuscandoTickerAPI(false);
    }
  };

  const seleccionarSugerencia = async (tickerSymbol, nombreEmpresa, tipoManual) => {
    setSugerencias([]);
    setObteniendoPrecioAPI(true);
    let precioEnVivo = '';
    const cleanTicker = tickerSymbol.replace('BINANCE:', '');

    try {
      const respQuote = await fetch(`https://finnhub.io/api/v1/quote?symbol=${tickerSymbol}&token=${API_KEY}`);
      const datosQuote = await respQuote.json();
      if (datosQuote && datosQuote.c && datosQuote.c > 0) {
        precioEnVivo = datosQuote.c;
      }
    } catch (err) {
      console.error("Error consultando precio:", err);
    } finally {
      setObteniendoPrecioAPI(false);
    }

    setNuevoActivo({
      ...nuevoActivo,
      ticker: cleanTicker,
      nombre: nombreEmpresa || cleanTicker,
      tipo: tipoManual || 'Acción',
      precioCompra: precioEnVivo ? precioEnVivo.toString() : nuevoActivo.precioCompra
    });
  };

  const abrirModalCrear = () => {
    setErrorCaja('');
    setModoEdicion(false); setActivoEditandoId(null); setSugerencias([]);
    setNuevoActivo({ ticker: '', nombre: '', tipo: 'Acción', cant: '', precioCompra: '', notas: '' });
    setIsModalOpen(true);
  };

  const abrirModalEditar = (pos) => {
    setErrorCaja('');
    setModoEdicion(true); setActivoEditandoId(pos.id); setSugerencias([]);
    setNuevoActivo({
      ticker: pos.ticker, nombre: pos.nombre, tipo: pos.tipo,
      cant: pos.cant.toString(), precioCompra: pos.precioCompra.toString(), notas: pos.notas || ''
    });
    setIsModalOpen(true);
  };

  const handleGuardarActivo = async (e) => {
    e.preventDefault();
    setErrorCaja('');
    if (!usuarioActual) return;

    const tickerUpper = nuevoActivo.ticker.toUpperCase().trim();
    const cantNuevas = parseFloat(nuevoActivo.cant.toString().replace(',', '.')) || 0;
    const precioNuevo = parseFloat(nuevoActivo.precioCompra.toString().replace(',', '.')) || 0;
    const costoTotalOperacion = cantNuevas * precioNuevo;

    if (modoEdicion) {
      const posAnterior = posiciones.find(p => p.id === activoEditandoId);
      const costoAnterior = posAnterior ? posAnterior.cant * posAnterior.precioCompra : 0;
      const diferenciaCosto = costoTotalOperacion - costoAnterior;

      if (diferenciaCosto > saldoCaja) {
        setErrorCaja(`Saldo insuficiente. Necesitas $${diferenciaCosto.toFixed(2)} adicionales en caja.`);
        return;
      }

      await actualizarSaldoCajaBaseDatos(saldoCaja - diferenciaCosto);

      const { error } = await supabase
        .from('posiciones')
        .update({
          nombre: nuevoActivo.nombre || posAnterior.nombre,
          tipo: nuevoActivo.tipo,
          cant: cantNuevas,
          precio_compra: precioNuevo,
          notas: nuevoActivo.notas
        })
        .eq('id', activoEditandoId);

      if (error) console.error("Error al editar:", error.message);
      else cargarDatosUsuario(usuarioActual.id);

    } else {
      if (costoTotalOperacion > saldoCaja) {
        setErrorCaja(`Saldo insuficiente. Esta compra requiere $${costoTotalOperacion.toFixed(2)} y tienes $${saldoCaja.toFixed(2)} disponible.`);
        return;
      }

      const activoExistente = posiciones.find(p => p.ticker === tickerUpper);

      if (activoExistente) {
        const cantTotal = activoExistente.cant + cantNuevas;
        const costoTotalInvertido = (activoExistente.cant * activoExistente.precioCompra) + costoTotalOperacion;
        const nuevoPrecioPromedio = costoTotalInvertido / cantTotal;

        await actualizarSaldoCajaBaseDatos(saldoCaja - costoTotalOperacion);

        await supabase
          .from('posiciones')
          .update({
            cant: cantTotal,
            precio_compra: nuevoPrecioPromedio,
            notas: nuevoActivo.notas || activoExistente.notas
          })
          .eq('id', activoExistente.id);

      } else {
        await actualizarSaldoCajaBaseDatos(saldoCaja - costoTotalOperacion);

        await supabase.from('posiciones').insert([
          {
            user_id: usuarioActual.id,
            ticker: tickerUpper,
            nombre: nuevoActivo.nombre || tickerUpper,
            tipo: nuevoActivo.tipo,
            cant: cantNuevas,
            precio_compra: precioNuevo,
            notas: nuevoActivo.notas || ''
          }
        ]);
      }
      cargarDatosUsuario(usuarioActual.id);
    }
    setIsModalOpen(false);
  };

  const eliminarActivo = async (id, ticker) => {
    if (!usuarioActual) return;
    const pos = posiciones.find(p => p.id === id);
    if (pos) {
      const reembolso = pos.cant * pos.precioActual;
      await actualizarSaldoCajaBaseDatos(saldoCaja + reembolso);
    }

    const { error } = await supabase.from('posiciones').delete().eq('id', id);
    if (error) console.error("Error al eliminar:", error.message);
    else setPosiciones(posiciones.filter(p => p.id !== id));
  };

  // -------------------------------------------------------------
  // CÁLCULOS GENERALES DEL PORTAFOLIO
  // -------------------------------------------------------------
  let valorInversiones = 0, costoTotalInversiones = 0, cambioDiarioTotalUSD = 0;
  const distribucionMap = { 'Acción': 0, 'ETF': 0, 'Renta Fija': 0, 'Cripto': 0 };

  posiciones.forEach(pos => {
    const valor = pos.cant * pos.precioActual;
    valorInversiones += valor;
    costoTotalInversiones += pos.cant * pos.precioCompra;
    cambioDiarioTotalUSD += (pos.cant * (pos.cambioDiarioUSD || 0));
    if (distribucionMap[pos.tipo] !== undefined) distribucionMap[pos.tipo] += valor;
  });

  const patrimonioTotal = saldoCaja + valorInversiones;
  const rendimientoHistorico = valorInversiones - costoTotalInversiones;
  const porcentajeHistorico = costoTotalInversiones > 0 ? (rendimientoHistorico / costoTotalInversiones) * 100 : 0;
  const cambioDiarioTotalPct = (valorInversiones - cambioDiarioTotalUSD) > 0 ? (cambioDiarioTotalUSD / (valorInversiones - cambioDiarioTotalUSD)) * 100 : 0;

  let topGainer = null, topLoser = null;
  if (posiciones.length > 0) {
    const ordenados = [...posiciones].sort((a, b) => ((b.precioActual - b.precioCompra) / b.precioCompra) - ((a.precioActual - a.precioCompra) / a.precioCompra));
    topGainer = ordenados[0];
    topLoser = ordenados[ordenados.length - 1];
  }

  const coloresTipo = { 'Acción': '#3b82f6', 'ETF': '#22c55e', 'Renta Fija': '#f59e0b', 'Cripto': '#a855f7' };
  const datosDistribucion = Object.keys(distribucionMap).filter(k => distribucionMap[k] > 0).map(k => ({ name: k, value: Math.round(distribucionMap[k]), color: coloresTipo[k] }));

  const posicionesFiltradas = posiciones.filter(p => {
    const coincideBusqueda = p.ticker.toLowerCase().includes(busqueda.toLowerCase()) || p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const coincideTipo = filtroTipo === 'Todos' || p.tipo === filtroTipo;
    return coincideBusqueda && coincideTipo;
  });

  if (cargandoAuth) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  // PANTALLA LOGIN/REGISTRO SI NO HAY SESIÓN EN SUPABASE
  if (!usuarioActual) {
    return (
      <div className="min-h-screen bg-[#121212] font-sans text-white flex items-center justify-center p-4">
        <div className="bg-[#1E1E1E] border border-gray-800 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(34,197,94,0.4)]">
              <span className="text-white font-bold text-2xl">F</span>
            </div>
            <h1 className="text-2xl font-bold tracking-wide">Fin<span className="text-green-400">Track</span></h1>
            <p className="text-gray-400 text-sm mt-1">Plataforma de gestión financiera e inversión</p>
          </div>

          <div className="flex bg-[#121212] p-1 rounded-xl mb-6 border border-gray-800">
            <button onClick={() => { setModoAuth('login'); setErrorAuth(''); }} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${modoAuth === 'login' ? 'bg-green-500 text-[#121212]' : 'text-gray-400 hover:text-white'}`}>Iniciar Sesión</button>
            <button onClick={() => { setModoAuth('register'); setErrorAuth(''); }} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${modoAuth === 'register' ? 'bg-green-500 text-[#121212]' : 'text-gray-400 hover:text-white'}`}>Registrarse</button>
          </div>

          {errorAuth && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-xs p-3 rounded-xl mb-4 text-center">{errorAuth}</div>}

          {modoAuth === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Correo Electrónico</label>
                <input required type="email" value={formAuth.email} onChange={(e) => setFormAuth({ ...formAuth, email: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500" placeholder="tucorreo@example.com" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Contraseña</label>
                <input required type="password" value={formAuth.password} onChange={(e) => setFormAuth({ ...formAuth, password: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500" placeholder="••••••••" />
              </div>
              <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)] mt-2">
                Ingresar a FinTrack
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegistroSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre Completo</label>
                <input required type="text" value={formAuth.nombre} onChange={(e) => setFormAuth({ ...formAuth, nombre: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500" placeholder="Juan Pérez" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Correo Electrónico</label>
                <input required type="email" value={formAuth.email} onChange={(e) => setFormAuth({ ...formAuth, email: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500" placeholder="tucorreo@example.com" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Contraseña</label>
                <input required type="password" value={formAuth.password} onChange={(e) => setFormAuth({ ...formAuth, password: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500" placeholder="••••••••" />
              </div>
              <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)] mt-2">
                Crear Cuenta Gratis
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] font-sans text-white flex flex-col justify-between">
      {/* NAVEGACIÓN */}
      <nav className="bg-[#121212] border-b border-gray-800 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center cursor-pointer">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center mr-3 shadow-[0_0_15px_rgba(34,197,94,0.4)]">
              <span className="text-white font-bold text-xl">F</span>
            </div>
            <span className="text-white font-bold text-xl tracking-wide">Fin<span className="text-green-400">Track</span></span>
          </div>

          <div className="hidden md:flex space-x-8">
            <button onClick={() => setTabActiva('simulador')} className={`font-medium transition-colors ${tabActiva === 'simulador' ? 'text-green-400 border-b-2 border-green-400 pb-1' : 'text-gray-400 hover:text-white'}`}>Simulador</button>
            <button onClick={() => setTabActiva('portafolio')} className={`font-medium transition-colors ${tabActiva === 'portafolio' ? 'text-green-400 border-b-2 border-green-400 pb-1' : 'text-gray-400 hover:text-white'}`}>Mi Portafolio</button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-[#1E1E1E] border border-gray-800 py-1.5 px-3 rounded-full">
              <span className="w-7 h-7 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-xs font-bold">
                {usuarioActual.nombre.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-medium text-gray-300 hidden sm:inline">{usuarioActual.nombre}</span>
            </div>

            <button onClick={handleCerrarSesion} title="Cerrar Sesión" className="bg-gray-800 hover:bg-red-500/20 hover:text-red-400 text-gray-400 p-2 rounded-xl border border-gray-700 transition-colors text-xs font-semibold">
              🚪 Salir
            </button>
          </div>
        </div>
      </nav>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-6 py-10 relative flex-1 w-full">

        {/* === PESTAÑA: SIMULADOR === */}
        {tabActiva === 'simulador' && (
          <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold mb-3">Simulador de Interés Compuesto</h1>
              <p className="text-gray-400 text-sm max-w-2xl mx-auto leading-relaxed">
                Proyecta el crecimiento de tu patrimonio a largo plazo utilizando nuestra calculadora financiera avanzada.
              </p>
            </div>

            <div className="bg-[#1E1E1E] border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-3 text-xs font-semibold text-gray-400 bg-[#161616] border-b border-gray-800 flex justify-between items-center">
                <span>CONFIGURACIÓN DE PARÁMETROS</span>
                <span className="text-green-400 font-mono">* Campos obligatorios</span>
              </div>

              <form onSubmit={handleCalcular} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pb-6 border-b border-gray-800">
                  <div>
                    <label className="font-semibold text-white block mb-1 text-sm">Inversión inicial <span className="text-green-400">*</span></label>
                    <span className="text-xs text-gray-400">Monto disponible para invertir inicialmente.</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
                    <input type="number" required min="0" value={simInicial} onChange={(e) => setSimInicial(e.target.value)} className="w-full bg-[#121212] border border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-white font-mono focus:outline-none focus:border-green-500 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pb-6 border-b border-gray-800">
                  <div>
                    <label className="font-semibold text-white block mb-1 text-sm">Contribución mensual</label>
                    <span className="text-xs text-gray-400">Monto previsto a aportar al capital cada mes.</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
                    <input type="number" min="0" value={simMensual} onChange={(e) => setSimMensual(e.target.value)} className="w-full bg-[#121212] border border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-white font-mono focus:outline-none focus:border-green-500 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pb-6 border-b border-gray-800">
                  <div>
                    <label className="font-semibold text-white block mb-1 text-sm">Cantidad de tiempo en años <span className="text-green-400">*</span></label>
                    <span className="text-xs text-gray-400">Plazo total previsto para la inversión.</span>
                  </div>
                  <div>
                    <input type="number" required min="1" max="100" value={simAnios} onChange={(e) => setSimAnios(e.target.value)} className="w-full bg-[#121212] border border-gray-700 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-green-500 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pb-6 border-b border-gray-800">
                  <div>
                    <label className="font-semibold text-white block mb-1 text-sm">Tasa de interés estimada <span className="text-green-400">*</span></label>
                    <span className="text-xs text-gray-400">Tasa de rendimiento anual estimada (%).</span>
                  </div>
                  <div>
                    <input type="number" required step="0.1" value={simTasa} onChange={(e) => setSimTasa(e.target.value)} className="w-full bg-[#121212] border border-gray-700 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-green-500 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pb-6 border-b border-gray-800">
                  <div>
                    <label className="font-semibold text-white block mb-1 text-sm">Rango de varianza de tasas</label>
                    <span className="text-xs text-gray-400">Margen de error (± %) para escenarios optimista/pesimista.</span>
                  </div>
                  <div>
                    <input type="number" step="0.1" min="0" value={simVarianza} onChange={(e) => setSimVarianza(e.target.value)} placeholder="Ej: 2 (opcional)" className="w-full bg-[#121212] border border-gray-700 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-green-500 text-sm placeholder:text-gray-600" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pb-2">
                  <div>
                    <label className="font-semibold text-white block mb-1 text-sm">Frecuencia de capitalización</label>
                    <span className="text-xs text-gray-400">Frecuencia con la que se reinvierte el interés.</span>
                  </div>
                  <div>
                    <select value={simFrecuencia} onChange={(e) => setSimFrecuencia(e.target.value)} className="w-full bg-[#121212] border border-gray-700 text-white text-sm rounded-xl focus:outline-none focus:border-green-500 block p-2.5 font-sans">
                      <option value="12">Mensualmente</option>
                      <option value="2">Semestralmente</option>
                      <option value="1">Anualmente</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-800">
                  <button type="button" onClick={handleRestablecer} className="bg-transparent hover:bg-gray-800 text-gray-300 font-semibold py-2.5 px-6 rounded-xl text-sm transition-colors border border-gray-700">Restablecer</button>
                  <button type="submit" className="bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-2.5 px-8 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">Calcular Proyección</button>
                </div>
              </form>

              {simResultados && (
                <div className="bg-[#161616] text-white p-6 md:p-8 animate-fade-in border-t border-gray-800">
                  <div className="text-center mb-8">
                    <h2 className="text-xl font-bold text-gray-300 mb-1">Resultados de la Simulación</h2>
                    <p className="text-2xl md:text-3xl font-extrabold text-green-400">
                      En {simAnios} años tendrás $ {simResultados[simResultados.length - 1].esperado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-inner">
                    <h3 className="font-semibold mb-6 text-gray-300 text-sm">Crecimiento de Ahorros en el Tiempo</h3>
                    <div className="w-full h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simResultados} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                          <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#888' }} tickMargin={10} />
                          <YAxis tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(val) => `$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#121212', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`$${value.toLocaleString('en-US')}`, '']} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '15px' }} />

                          {simVarianza > 0 && <Line type="monotone" dataKey="optimista" name={`Optimista (+${simVarianza}%)`} stroke="#3b82f6" strokeWidth={2} dot={false} />}
                          <Line type="monotone" dataKey="esperado" name={`Esperado (${simTasa}%)`} stroke="#22c55e" strokeWidth={3} dot={false} />
                          {simVarianza > 0 && <Line type="monotone" dataKey="pesimista" name={`Pesimista (-${simVarianza}%)`} stroke="#ef4444" strokeWidth={2} dot={false} />}
                          <Line type="monotone" dataKey="aportes" name="Capital Invertido" stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="text-center mt-6">
                    <button onClick={() => setMostrarTabla(!mostrarTabla)} className="bg-[#252525] hover:bg-[#303030] text-green-400 font-semibold py-2.5 px-6 rounded-xl text-sm transition-colors border border-gray-700 shadow-md">
                      {mostrarTabla ? 'Ocultar Detalle Anual' : 'Ver Tabla de Desglose Detallado'}
                    </button>
                  </div>

                  {mostrarTabla && (
                    <div className="mt-6 bg-[#121212] border border-gray-800 rounded-xl overflow-hidden text-sm shadow-xl">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-[#1A1A1A] text-gray-400 border-b border-gray-800 text-xs">
                            <tr>
                              <th className="p-3.5 font-medium">Plazo</th>
                              <th className="p-3.5 font-medium text-right">Capital Acumulado</th>
                              <th className="p-3.5 font-medium text-right">Valor Futuro Esperado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800/60 font-mono text-xs">
                            {simResultados.map((fila, index) => (
                              <tr key={index} className="hover:bg-[#1a1a1a] transition-colors">
                                <td className="p-3.5 font-sans font-medium text-gray-300">{fila.year}</td>
                                <td className="p-3.5 text-right text-gray-400">${fila.aportes.toLocaleString('en-US')}</td>
                                <td className="p-3.5 text-right font-bold text-green-400">${fila.esperado.toLocaleString('en-US')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === PESTAÑA: MI PORTAFOLIO CON CAJA Y HISTORIAL DE PATRIMONIO === */}
        {tabActiva === 'portafolio' && (
          <div className="space-y-8 animate-fade-in">
            {/* Encabezado Principal */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
              <div>
                <h1 className="text-3xl font-bold mb-1">Mi Portafolio de Inversión</h1>
                <p className="text-gray-400 text-sm">
                  {cargandoPrecios ? "⏳ Conectando con la Bolsa de Valores..." : "☁️ Conectado a Supabase (Sincronización en la Nube)"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button onClick={() => setMostrarModalCaja(true)} className="bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 text-xs font-bold py-2.5 px-3.5 rounded-xl transition-colors flex items-center gap-1.5">
                  💵 Depositar Capital
                </button>
                {saldoCaja > 0 && (
                  <button onClick={handleResetearCaja} title="Vaciar saldo en caja" className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-bold py-2.5 px-3 rounded-xl transition-colors">
                    🧹 Vaciar Caja
                  </button>
                )}
                {(saldoCaja > 0 || posiciones.length > 0) && (
                  <button onClick={handleResetearPortafolioCompleto} title="Borrar caja y posiciones" className="bg-gray-800 border border-gray-700 text-gray-400 hover:bg-red-500/20 hover:text-red-400 text-xs font-semibold py-2.5 px-3 rounded-xl transition-colors">
                    🔄 Reiniciar Cuenta
                  </button>
                )}
                <button onClick={actualizarPreciosDesdeBolsa} disabled={cargandoPrecios || posiciones.length === 0} className="bg-[#1E1E1E] border border-gray-700 hover:border-gray-500 text-white text-xs font-medium py-2.5 px-3.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                  🔄 Actualizar
                </button>
                <button onClick={abrirModalCrear} className="bg-green-500 hover:bg-green-600 text-[#121212] text-xs font-bold py-2.5 px-5 rounded-xl transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                  + Agregar Activo
                </button>
              </div>
            </div>

            {/* BANNER BIENVENIDA SI NO TIENE SALDO INICIAL */}
            {saldoCaja === 0 && posiciones.length === 0 && (
              <div className="bg-gradient-to-r from-green-500/20 via-green-500/10 to-transparent border border-green-500/40 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">👋 ¡Bienvenido a tu Portafolio FinTrack!</h3>
                  <p className="text-xs text-gray-300">Para comenzar, ingresa el dinero inicial disponible para invertir en tu caja.</p>
                </div>
                <button onClick={() => setMostrarModalCaja(true)} className="bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-2.5 px-6 rounded-xl text-xs whitespace-nowrap shadow-lg">
                  + Iniciar Capital de Inversión
                </button>
              </div>
            )}

            {/* Métricas Globales de Balance (INCLUYENDO CAJA) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Patrimonio Total</h3>
                <div className="text-3xl font-extrabold text-white mt-1">$ {patrimonioTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <span className="text-[10px] text-gray-500 mt-1 block">Inversiones + Dinero Disponible</span>
              </div>

              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg relative group">
                <div className="flex justify-between items-start">
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Efectivo Disponible (Caja)</h3>
                  {saldoCaja > 0 && (
                    <button onClick={handleResetearCaja} title="Vaciar saldo disponible" className="text-xs text-red-400 opacity-60 hover:opacity-100 transition-opacity">
                      🗑️
                    </button>
                  )}
                </div>
                <div className="text-3xl font-extrabold text-green-400 mt-1">$ {saldoCaja.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <span className="text-[10px] text-gray-500 mt-1 block">Listo para comprar activos</span>
              </div>

              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Rendimiento Histórico</h3>
                <div className="flex items-end space-x-2 mt-1">
                  <div className={`text-2xl font-bold ${rendimientoHistorico >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {rendimientoHistorico >= 0 ? '+' : ''}${rendimientoHistorico.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className={`text-xs font-bold mb-1 px-2 py-0.5 rounded ${rendimientoHistorico >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {porcentajeHistorico >= 0 ? '+' : ''}{porcentajeHistorico.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 mt-1 block">Resultado neto de posiciones</span>
              </div>

              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Variación de Hoy</h3>
                <div className="flex items-end space-x-2 mt-1">
                  <div className={`text-2xl font-bold ${cambioDiarioTotalUSD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {cambioDiarioTotalUSD >= 0 ? '+' : ''}${cambioDiarioTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className={`text-xs font-bold mb-1 px-2 py-0.5 rounded ${cambioDiarioTotalUSD >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {cambioDiarioTotalPct >= 0 ? '+' : ''}{cambioDiarioTotalPct.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 mt-1 block">Variación diaria de mercado</span>
              </div>
            </div>

            {/* GRÁFICO HISTÓRICO REAL Y ACTIVOS DESTACADOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-gray-300">Historial Diario de Patrimonio (Evolución Real)</h3>
                  <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded font-mono">
                    {historialPatrimonio.length} día(s) registrado(s)
                  </span>
                </div>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historialPatrimonio.length > 0 ? historialPatrimonio : [{ fecha: 'Hoy', valor: patrimonioTotal }]}>
                      <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                      <XAxis dataKey="fecha" stroke="#666" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#666" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#121212', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(val) => [`$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Patrimonio Total']} />
                      <Area type="monotone" dataKey="valor" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-1 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg flex flex-col justify-between">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-800 pb-2">Destacados del Portafolio</h3>
                <div className="space-y-4">
                  {topGainer ? (
                    <div className="bg-[#121212] p-3 rounded-xl border border-green-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider block">🏆 Mayor Ganador</span>
                        <span className="font-bold text-white text-sm">{topGainer.ticker}</span>
                        <span className="text-xs text-gray-400 block">{topGainer.nombre}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-green-400 font-mono">
                          +{(((topGainer.precioActual - topGainer.precioCompra) / topGainer.precioCompra) * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 text-center py-4">No hay activos suficientes</div>
                  )}

                  {topLoser && topLoser !== topGainer && (
                    <div className="bg-[#121212] p-3 rounded-xl border border-red-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">📉 Mayor Caída</span>
                        <span className="font-bold text-white text-sm">{topLoser.ticker}</span>
                        <span className="text-xs text-gray-400 block">{topLoser.nombre}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-red-400 font-mono">
                          {(((topLoser.precioActual - topLoser.precioCompra) / topLoser.precioCompra) * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Barra de Filtros y Buscador */}
            <div className="bg-[#1E1E1E] p-4 rounded-2xl border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="relative w-full md:w-72">
                <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por Ticker o Nombre..."
                  className="w-full bg-[#121212] border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-green-500"
                />
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {['Todos', 'Acción', 'ETF', 'Renta Fija', 'Cripto'].map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => setFiltroTipo(tipo)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filtroTipo === tipo ? 'bg-green-500 text-[#121212]' : 'bg-[#121212] text-gray-400 hover:text-white border border-gray-800'}`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>
            </div>

            {/* Distribución y Tabla de Activos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg flex flex-col">
                <h3 className="text-base font-semibold mb-4 border-b border-gray-800 pb-2">Distribución de Activos</h3>
                {posiciones.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-xs text-center py-10">
                    Agrega un activo para ver tu distribución.
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-h-[220px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={datosDistribucion} innerRadius={65} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                            {datosDistribucion.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: '#121212', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => `$${value.toLocaleString()}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      {datosDistribucion.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <div className="flex items-center space-x-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                            <span className="text-gray-300">{item.name}</span>
                          </div>
                          <span className="text-white font-mono font-medium">{valorInversiones > 0 ? ((item.value / valorInversiones) * 100).toFixed(1) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Tabla de Posiciones */}
              <div className="lg:col-span-2 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg overflow-x-auto">
                <h3 className="text-base font-semibold mb-6 border-b border-gray-800 pb-2">Tus Posiciones ({posicionesFiltradas.length})</h3>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="pb-3 font-medium">Activo</th>
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium text-right">Cant.</th>
                      <th className="pb-3 font-medium text-right">Compra (PPP)</th>
                      <th className="pb-3 font-medium text-right">Actual</th>
                      <th className="pb-3 font-medium text-right">Retorno</th>
                      <th className="pb-3 font-medium text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {posicionesFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-12 text-center text-gray-500">
                          {posiciones.length === 0 ? "Tu portafolio está vacío. Agrega tu primera inversión." : "No hay activos que coincidan con la búsqueda o filtro."}
                        </td>
                      </tr>
                    ) : (
                      posicionesFiltradas.map((pos, index) => {
                        const gananciaUSD = pos.cant * (pos.precioActual - pos.precioCompra);
                        const retornoPct = ((pos.precioActual - pos.precioCompra) / pos.precioCompra) * 100;
                        const esPositivo = gananciaUSD >= 0;

                        return (
                          <tr key={index} className="hover:bg-[#252525] transition-colors group">
                            <td className="py-4">
                              <div className="font-bold text-white text-sm">{pos.ticker}</div>
                              <div className="text-[11px] text-gray-400">{pos.nombre}</div>
                              {pos.notas && <div className="text-[10px] text-gray-500 italic mt-0.5">📝 {pos.notas}</div>}
                            </td>
                            <td className="py-4 text-gray-300"><span className="bg-[#121212] border border-gray-800 px-2 py-0.5 rounded text-[10px] font-mono">{pos.tipo}</span></td>
                            <td className="py-4 text-right font-mono text-gray-300">{pos.cant.toFixed(4)}</td>
                            <td className="py-4 text-right font-mono text-gray-300">${pos.precioCompra.toFixed(2)}</td>
                            <td className="py-4 text-right font-mono text-white font-bold">${pos.precioActual.toFixed(2)}</td>

                            <td className="py-4 text-right font-mono">
                              <div className="flex flex-col items-end">
                                <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${esPositivo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {esPositivo ? '+' : ''}{retornoPct.toFixed(2)}%
                                </span>
                                <span className={`text-[10px] font-semibold mt-0.5 ${esPositivo ? 'text-green-400' : 'text-red-400'}`}>
                                  {esPositivo ? '+' : ''}${gananciaUSD.toFixed(2)}
                                </span>
                              </div>
                            </td>

                            <td className="py-4 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button onClick={() => abrirModalEditar(pos)} className="text-gray-400 hover:text-white p-1 rounded transition-colors" title="Editar Activo">
                                  ✏️
                                </button>
                                <button onClick={() => eliminarActivo(pos.id, pos.ticker)} className="text-red-500 hover:text-red-400 p-1 rounded transition-colors" title="Eliminar Activo (Vender)">
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* PIE DE PÁGINA */}
      <footer className="border-t border-gray-800 bg-[#121212] py-8 mt-16 text-center text-xs text-gray-500 w-full">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center font-bold text-[#121212] text-xs">F</div>
            <span className="font-bold text-gray-300">FinTrack</span>
          </div>
          <p>© {new Date().getFullYear()} FinTrack. Todos los derechos reservados.</p>
          <div className="flex space-x-4 text-gray-400">
            <span>Mercados Financieros en Tiempo Real</span>
          </div>
        </div>
      </footer>

      {/* MODAL INGRESAR CAPITAL EN CAJA */}
      {mostrarModalCaja && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1E1E1E] rounded-3xl border border-gray-700 shadow-2xl w-full max-w-md p-6 relative animate-fade-in">
            <div className="flex justify-between items-center mb-5 border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-xl font-bold text-white">Ingresar Capital Líquido</h2>
                <p className="text-xs text-gray-400">Añade dinero a tu caja para realizar inversiones</p>
              </div>
              <button onClick={() => setMostrarModalCaja(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleIngresarCapital} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Monto a Depositar ($ USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                  <input
                    required
                    type="text"
                    value={inputDeposito}
                    onChange={(e) => setInputDeposito(e.target.value.replace(',', '.'))}
                    className="w-full bg-[#121212] border border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-white font-mono focus:outline-none focus:border-green-500 text-sm"
                    placeholder="Ej: 1000"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setMostrarModalCaja(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl text-sm font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-3 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">Depositar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EXPLORADOR DE MERCADO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1E1E1E] rounded-3xl border border-gray-700 shadow-2xl w-full max-w-lg p-6 relative animate-fade-in">
            <div className="flex justify-between items-center mb-5 border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-xl font-bold text-white">{modoEdicion ? 'Editar Activo' : 'Explorador de Mercado'}</h2>
                <p className="text-xs text-gray-400">Disponible en Caja: <strong className="text-green-400 font-mono">${saldoCaja.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong></p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {errorCaja && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-xs p-3 rounded-xl mb-4 text-center font-semibold">
                ⚠️ {errorCaja}
              </div>
            )}

            <form onSubmit={handleGuardarActivo} className="space-y-4">
              {!modoEdicion && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">🔥 Activos Populares del Mercado</label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {ACTIVOS_POPULARES.map((act, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => seleccionarSugerencia(act.ticker, act.nombre, act.tipo)}
                        className="bg-[#121212] hover:bg-green-500/20 hover:border-green-500/50 border border-gray-800 rounded-lg px-2.5 py-1 text-xs text-gray-300 hover:text-green-400 flex items-center space-x-1.5 transition-colors"
                      >
                        <span className="font-bold">{act.tickerDisplay || act.ticker}</span>
                        <span className="text-[9px] text-gray-500">• {act.tipo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative pt-2">
                <label className="text-xs text-gray-400 mb-1 flex justify-between">
                  <span>Buscar por Ticker o Nombre</span>
                  {buscandoTickerAPI && <span className="text-green-400 font-mono">🔍 Buscando en bolsa...</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-500 text-xs">🔍</span>
                  <input
                    required
                    disabled={modoEdicion}
                    type="text"
                    value={nuevoActivo.ticker}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setNuevoActivo({ ...nuevoActivo, ticker: val });
                      if (!modoEdicion) buscarSimboloEnBolsa(val);
                    }}
                    className="w-full bg-[#121212] border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white uppercase text-sm focus:outline-none focus:border-green-500 disabled:opacity-50"
                    placeholder="Ej: AAPL, NVDA, TSLA, BTC..."
                  />
                </div>

                {!modoEdicion && sugerencias.length > 0 && (
                  <div className="absolute left-0 right-0 top-[76px] bg-[#161616] border border-gray-700 rounded-xl shadow-2xl z-50 max-h-52 overflow-y-auto divide-y divide-gray-800">
                    {sugerencias.map((item, idx) => {
                      let tagColor = "bg-blue-500/20 text-blue-400 border-blue-500/30";
                      let tLabel = "Acción";
                      if (item.type?.toLowerCase().includes('etf')) { tagColor = "bg-green-500/20 text-green-400 border-green-500/30"; tLabel = "ETF"; }
                      else if (item.type?.toLowerCase().includes('crypto')) { tagColor = "bg-purple-500/20 text-purple-400 border-purple-500/30"; tLabel = "Cripto"; }

                      return (
                        <div
                          key={idx}
                          onClick={() => seleccionarSugerencia(item.symbol, item.description, tLabel)}
                          className="p-3 hover:bg-green-500/10 hover:border-l-4 hover:border-l-green-500 cursor-pointer transition-colors flex justify-between items-center"
                        >
                          <div>
                            <div className="font-bold text-white text-xs">{item.symbol}</div>
                            <div className="text-[11px] text-gray-400 truncate max-w-[240px]">{item.description}</div>
                          </div>
                          <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full ${tagColor}`}>{tLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Tipo de Activo</label>
                  <select value={nuevoActivo.tipo} onChange={(e) => setNuevoActivo({ ...nuevoActivo, tipo: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-2.5 text-white text-sm">
                    <option>Acción</option>
                    <option>ETF</option>
                    <option>Renta Fija</option>
                    <option>Cripto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Nombre / Empresa</label>
                  <input required type="text" value={nuevoActivo.nombre} onChange={(e) => setNuevoActivo({ ...nuevoActivo, nombre: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-2.5 text-white text-sm" placeholder="Ej: Apple Inc." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-400">Cantidad</label>
                    {saldoCaja > 0 && parseFloat(nuevoActivo.precioCompra.toString().replace(',', '.')) > 0 && (
                      <div className="flex space-x-1 text-[9px]">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              const p = parseFloat(nuevoActivo.precioCompra.toString().replace(',', '.'));
                              if (p > 0) {
                                const c = (saldoCaja * pct) / p;
                                setNuevoActivo({ ...nuevoActivo, cant: c.toFixed(4) });
                              }
                            }}
                            className="bg-gray-800 hover:bg-green-500/20 hover:text-green-400 text-gray-300 px-1.5 py-0.5 rounded border border-gray-700"
                          >
                            {pct * 100}%
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    required
                    type="text"
                    value={nuevoActivo.cant}
                    onChange={(e) => setNuevoActivo({ ...nuevoActivo, cant: e.target.value.replace(',', '.') })}
                    className="w-full bg-[#121212] border border-gray-700 rounded-xl p-2.5 text-white text-sm font-mono"
                    placeholder="Ej: 10 o 0.5"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 flex justify-between">
                    <span>Precio Compra ($)</span>
                    {obteniendoPrecioAPI && <span className="text-green-400 animate-pulse">Obteniendo...</span>}
                  </label>
                  <input
                    required
                    type="text"
                    value={nuevoActivo.precioCompra}
                    onChange={(e) => setNuevoActivo({ ...nuevoActivo, precioCompra: e.target.value.replace(',', '.') })}
                    className="w-full bg-[#121212] border border-gray-700 rounded-xl p-2.5 text-white text-sm font-mono"
                    placeholder="150.00"
                  />
                </div>
              </div>

              {/* RESUMEN Y VALIDACIÓN */}
              {(() => {
                const c = parseFloat(nuevoActivo.cant.toString().replace(',', '.')) || 0;
                const p = parseFloat(nuevoActivo.precioCompra.toString().replace(',', '.')) || 0;
                const total = c * p;
                const excede = total > saldoCaja;

                return (
                  <div className={`p-3 rounded-xl border flex justify-between items-center text-xs font-mono transition-colors ${excede ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-[#121212] border-gray-800 text-gray-300'}`}>
                    <div>
                      <span>Costo Total: </span>
                      <strong className={`text-sm ${excede ? 'text-red-400' : 'text-white'}`}>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                    </div>
                    {excede ? (
                      <span className="text-[10px] bg-red-500/20 px-2 py-0.5 rounded font-bold">⚠️ Excede saldo en caja</span>
                    ) : (
                      <span className="text-[10px] text-green-400">✅ Saldo disponible ok</span>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas / Comentarios (Opcional)</label>
                <input type="text" value={nuevoActivo.notas} onChange={(e) => setNuevoActivo({ ...nuevoActivo, notas: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-xl p-2.5 text-white text-sm" placeholder="Ej: Estrategia de inversión a largo plazo" />
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl text-sm font-semibold">Cancelar</button>
                <button
                  type="submit"
                  disabled={(() => {
                    const c = parseFloat(nuevoActivo.cant.toString().replace(',', '.')) || 0;
                    const p = parseFloat(nuevoActivo.precioCompra.toString().replace(',', '.')) || 0;
                    return (c * p) > saldoCaja || c <= 0 || p <= 0;
                  })()}
                  className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:hover:bg-green-500 text-[#121212] font-bold py-3 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                >
                  {modoEdicion ? 'Actualizar' : 'Ejecutar Compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;