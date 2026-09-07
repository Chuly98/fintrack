import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

function App() {
  const [tabActiva, setTabActiva] = useState('simulador');
  const [cargandoPrecios, setCargandoPrecios] = useState(false);

  // --- ESTADOS DEL SIMULADOR ---
  const [simInicial, setSimInicial] = useState(1000);
  const [simMensual, setSimMensual] = useState(200);
  const [simAnios, setSimAnios] = useState(10);
  const [simTasa, setSimTasa] = useState(10);
  const [simVarianza, setSimVarianza] = useState('');
  const [simFrecuencia, setSimFrecuencia] = useState(12);
  const [simResultados, setSimResultados] = useState(null);
  const [mostrarTabla, setMostrarTabla] = useState(false);

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
        aportes: Math.round(aportesTotales),
        esperado: Math.round(calcFV(rExp, n)),
        optimista: varz > 0 ? Math.round(calcFV(rOpt, n)) : null,
        pesimista: varz > 0 ? Math.round(calcFV(rPes, n)) : null
      });
    }
    setSimResultados(datos);
    setMostrarTabla(false);
  };

  const handleRestablecer = () => {
    setSimInicial(1000);
    setSimMensual(200);
    setSimAnios(10);
    setSimTasa(10);
    setSimVarianza('');
    setSimFrecuencia(12);
    setSimResultados(null);
    setMostrarTabla(false);
  };

  // --- ESTADOS DEL PORTAFOLIO ---
  const [posiciones, setPosiciones] = useState(() => {
    const datosGuardados = localStorage.getItem('finTrackPortafolio');
    return datosGuardados ? JSON.parse(datosGuardados) : [];
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nuevoActivo, setNuevoActivo] = useState({ ticker: '', nombre: '', tipo: 'Acción', cant: '', precioCompra: '' });

  useEffect(() => { localStorage.setItem('finTrackPortafolio', JSON.stringify(posiciones)); }, [posiciones]);

  const actualizarPreciosDesdeBolsa = async () => {
    if (!API_KEY || posiciones.length === 0) return;
    setCargandoPrecios(true);
    try {
      const posicionesActualizadas = await Promise.all(
        posiciones.map(async (pos) => {
          if (pos.tipo === 'Renta Fija') return pos;
          try {
            const respuesta = await fetch(`https://finnhub.io/api/v1/quote?symbol=${pos.ticker}&token=${API_KEY}`);
            const datos = await respuesta.json();
            if (datos && datos.c && datos.c > 0) return { ...pos, precioActual: datos.c };
          } catch (error) { console.error(error); }
          return pos;
        })
      );
      setPosiciones(posicionesActualizadas);
    } catch (error) { console.error(error); } finally { setCargandoPrecios(false); }
  };

  useEffect(() => {
    actualizarPreciosDesdeBolsa();
    const temporizador = setInterval(() => actualizarPreciosDesdeBolsa(), 30000);
    return () => clearInterval(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posiciones.length]);

  const handleAgregarActivo = (e) => {
    e.preventDefault();
    const activo = {
      ...nuevoActivo,
      ticker: nuevoActivo.ticker.toUpperCase(),
      nombre: nuevoActivo.nombre || 'Nuevo Activo',
      cant: parseFloat(nuevoActivo.cant),
      precioCompra: parseFloat(nuevoActivo.precioCompra),
      precioActual: parseFloat(nuevoActivo.precioCompra)
    };
    setPosiciones([...posiciones, activo]);
    setIsModalOpen(false);
    setNuevoActivo({ ticker: '', nombre: '', tipo: 'Acción', cant: '', precioCompra: '' });
  };

  const eliminarActivo = (ticker) => setPosiciones(posiciones.filter(p => p.ticker !== ticker));

  let balanceTotal = 0, costoTotal = 0;
  const distribucionMap = { 'Acción': 0, 'ETF': 0, 'Renta Fija': 0, 'Cripto': 0 };

  posiciones.forEach(pos => {
    const valor = pos.cant * pos.precioActual;
    balanceTotal += valor;
    costoTotal += pos.cant * pos.precioCompra;
    if (distribucionMap[pos.tipo] !== undefined) distribucionMap[pos.tipo] += valor;
  });

  const rendimientoHistorico = balanceTotal - costoTotal;
  const porcentajeHistorico = costoTotal > 0 ? (rendimientoHistorico / costoTotal) * 100 : 0;
  const coloresTipo = { 'Acción': '#3b82f6', 'ETF': '#22c55e', 'Renta Fija': '#f59e0b', 'Cripto': '#a855f7' };
  const datosDistribucion = Object.keys(distribucionMap).filter(k => distribucionMap[k] > 0).map(k => ({ name: k, value: Math.round(distribucionMap[k]), color: coloresTipo[k] }));

  return (
    <div className="min-h-screen bg-[#121212] font-sans text-white">
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
          <div className="flex items-center space-x-6">
            <button className="w-9 h-9 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700 hover:border-gray-500 transition-colors">
              <span className="text-gray-300 text-sm">👤</span>
            </button>
          </div>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="max-w-7xl mx-auto px-6 py-10 relative">

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
                  <button type="button" onClick={handleRestablecer} className="bg-transparent hover:bg-gray-800 text-gray-300 font-semibold py-2.5 px-6 rounded-xl text-sm transition-colors border border-gray-700">
                    Restablecer
                  </button>
                  <button type="submit" className="bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-2.5 px-8 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                    Calcular Proyección
                  </button>
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
                          <YAxis tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(val) => `$${val >= 1000 ? val / 1000 + 'k' : val}`} />
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

        {/* === PESTAÑA: MI PORTAFOLIO === */}
        {tabActiva === 'portafolio' && (
          <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Resumen de Cuenta</h1>
                <p className="text-gray-400">
                  {cargandoPrecios ? "⏳ Conectando con la Bolsa..." : "✅ Datos en tiempo real (Finnhub API)"}
                </p>
              </div>
              <div className="flex space-x-4">
                <button onClick={actualizarPreciosDesdeBolsa} disabled={cargandoPrecios || posiciones.length === 0} className="bg-[#1E1E1E] border border-gray-700 hover:border-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50">
                  🔄 Actualizar
                </button>
                <button onClick={() => setIsModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-2 px-6 rounded-lg transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                  + Agregar Activo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-sm font-medium mb-1">Balance Total</h3>
                <div className="text-3xl font-bold text-white mt-1">$ {balanceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-sm font-medium mb-1">Costo de Inversión</h3>
                <div className="text-3xl font-bold text-white mt-1">$ {costoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-sm font-medium mb-1">Rendimiento Histórico</h3>
                <div className="flex items-end space-x-3 mt-1">
                  <div className={`text-3xl font-bold ${rendimientoHistorico >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {rendimientoHistorico >= 0 ? '+' : ''}${rendimientoHistorico.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className={`font-medium pb-1 ${rendimientoHistorico >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ({porcentajeHistorico > 0 ? '+' : ''}{porcentajeHistorico.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg flex flex-col">
                <h3 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">Distribución</h3>
                {posiciones.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-sm text-center py-10">
                    Agrega un activo para ver tu distribución.
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-h-[250px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={datosDistribucion} innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">
                            {datosDistribucion.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: '#121212', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => `$${value.toLocaleString()}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      {datosDistribucion.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                            <span className="text-gray-300">{item.name}</span>
                          </div>
                          <span className="text-white font-medium">{balanceTotal > 0 ? ((item.value / balanceTotal) * 100).toFixed(1) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="lg:col-span-2 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg overflow-x-auto">
                <h3 className="text-lg font-semibold mb-6 border-b border-gray-700 pb-2">Tus Posiciones</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="pb-3 font-medium">Activo</th>
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium text-right">Cant.</th>
                      <th className="pb-3 font-medium text-right">Compra</th>
                      <th className="pb-3 font-medium text-right">Actual</th>
                      <th className="pb-3 font-medium text-right">Retorno</th>
                      <th className="pb-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {posiciones.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-12 text-center text-gray-500">
                          Tu portafolio está vacío. Haz clic en el botón verde para agregar tu primera inversión.
                        </td>
                      </tr>
                    ) : (
                      posiciones.map((pos, index) => {
                        const retornoPct = ((pos.precioActual - pos.precioCompra) / pos.precioCompra) * 100;
                        return (
                          <tr key={index} className="border-b border-gray-800 hover:bg-[#252525] transition-colors group">
                            <td className="py-4">
                              <div className="font-bold text-white">{pos.ticker}</div>
                              <div className="text-xs text-gray-500">{pos.nombre}</div>
                            </td>
                            <td className="py-4 text-gray-300"><span className="bg-gray-800 px-2 py-1 rounded text-xs">{pos.tipo}</span></td>
                            <td className="py-4 text-right font-mono text-gray-300">{pos.cant}</td>
                            <td className="py-4 text-right font-mono text-gray-300">${pos.precioCompra.toFixed(2)}</td>
                            <td className="py-4 text-right font-mono text-white">${pos.precioActual.toFixed(2)}</td>
                            <td className="py-4 text-right font-mono">
                              <span className={`px-2 py-1 rounded-md font-bold ${retornoPct >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {retornoPct >= 0 ? '+' : ''}{retornoPct.toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <button onClick={() => eliminarActivo(pos.ticker)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400" title="Eliminar activo">
                                🗑️
                              </button>
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

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1E1E1E] rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-3">
              <h2 className="text-xl font-bold text-white">Agregar Nuevo Activo</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAgregarActivo} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-400 mb-1 block">Ticker</label><input required type="text" value={nuevoActivo.ticker} onChange={(e) => setNuevoActivo({ ...nuevoActivo, ticker: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-lg p-2.5 text-white uppercase" /></div>
                <div><label className="text-xs text-gray-400 mb-1 block">Tipo</label><select value={nuevoActivo.tipo} onChange={(e) => setNuevoActivo({ ...nuevoActivo, tipo: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-lg p-2.5 text-white"><option>Acción</option><option>ETF</option><option>Renta Fija</option><option>Cripto</option></select></div>
              </div>
              <div><label className="text-xs text-gray-400 mb-1 block">Nombre</label><input required type="text" value={nuevoActivo.nombre} onChange={(e) => setNuevoActivo({ ...nuevoActivo, nombre: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-lg p-2.5 text-white" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-400 mb-1 block">Cantidad</label><input required type="number" step="any" min="0" value={nuevoActivo.cant} onChange={(e) => setNuevoActivo({ ...nuevoActivo, cant: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-lg p-2.5 text-white" /></div>
                <div><label className="text-xs text-gray-400 mb-1 block">Precio Compra ($)</label><input required type="number" step="any" min="0" value={nuevoActivo.precioCompra} onChange={(e) => setNuevoActivo({ ...nuevoActivo, precioCompra: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-lg p-2.5 text-white" /></div>
              </div>
              <div className="flex space-x-3 mt-6 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl">Cancelar</button>
                <button type="submit" className="flex-1 bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-3 rounded-xl">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;