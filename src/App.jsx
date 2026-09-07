import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Leemos nuestra llave secreta del archivo .env
const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

function App() {
  const [tabActiva, setTabActiva] = useState('portafolio');
  const [cargandoPrecios, setCargandoPrecios] = useState(false); // Estado para mostrar si está actualizando

  // --- ESTADOS DEL SIMULADOR ---
  const [capitalInicial, setCapitalInicial] = useState(1000);
  const [aporteMensual, setAporteMensual] = useState(200);
  const [anios, setAnios] = useState(10);
  const [instrumento, setInstrumento] = useState('0.10');

  const calcularProyeccion = () => {
    let tasaAnual = parseFloat(instrumento);
    let tasaMensual = tasaAnual / 12;
    let datos = [];
    let capitalAcumulado = capitalInicial;
    let totalInvertido = capitalInicial;
    datos.push({ year: 'Año 0', invertido: Math.round(totalInvertido), total: Math.round(capitalAcumulado) });
    for (let i = 1; i <= anios; i++) {
      for (let m = 0; m < 12; m++) {
        capitalAcumulado = (capitalAcumulado + aporteMensual) * (1 + tasaMensual);
        totalInvertido += aporteMensual;
      }
      datos.push({ year: `Año ${i}`, invertido: Math.round(totalInvertido), total: Math.round(capitalAcumulado) });
    }
    return { datosGrafico: datos, finalInvertido: Math.round(totalInvertido), finalTotal: Math.round(capitalAcumulado), finalGanancia: Math.round(capitalAcumulado - totalInvertido) };
  };
  const resultado = calcularProyeccion();

  // --- ESTADOS DEL PORTAFOLIO ---
  const [posiciones, setPosiciones] = useState([
    { ticker: 'SPY', nombre: 'S&P 500 ETF', tipo: 'ETF', cant: 15, precioCompra: 410.50, precioActual: 410.50 },
    { ticker: 'NVDA', nombre: 'Nvidia Corp', tipo: 'Acción', cant: 10, precioCompra: 85.00, precioActual: 85.00 },
    { ticker: 'GOOGL', nombre: 'Alphabet Inc', tipo: 'Acción', cant: 20, precioCompra: 130.20, precioActual: 130.20 },
    { ticker: 'AL30', nombre: 'Bono Arg 2030', tipo: 'Renta Fija', cant: 1000, precioCompra: 45.00, precioActual: 45.00 },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nuevoActivo, setNuevoActivo] = useState({ ticker: '', nombre: '', tipo: 'Acción', cant: '', precioCompra: '' });

  // --- NUEVA FUNCIÓN: CONEXIÓN A FINNHUB API ---
  const actualizarPreciosDesdeBolsa = async () => {
    if (!API_KEY) {
      alert("Falta la API Key de Finnhub en el archivo .env");
      return;
    }

    setCargandoPrecios(true); // Mostramos indicador de carga

    try {
      // Recorremos todas nuestras posiciones y le preguntamos a la API por cada una
      const posicionesActualizadas = await Promise.all(
        posiciones.map(async (pos) => {
          // Nota: Finnhub funciona mejor para acciones/ETFs de USA. 
          // Si es renta fija local (como AL30), ignoramos la consulta para evitar errores.
          if (pos.tipo === 'Renta Fija') return pos;

          try {
            const respuesta = await fetch(`https://finnhub.io/api/v1/quote?symbol=${pos.ticker}&token=${API_KEY}`);
            const datos = await respuesta.json();

            // Finnhub devuelve el precio actual en la variable "c" (current price)
            if (datos && datos.c && datos.c > 0) {
              return { ...pos, precioActual: datos.c };
            }
          } catch (error) {
            console.error(`Error consultando ${pos.ticker}:`, error);
          }
          return pos; // Si falla algo, devolvemos la posición con el precio viejo
        })
      );

      setPosiciones(posicionesActualizadas);
    } catch (error) {
      console.error("Error general de API:", error);
    } finally {
      setCargandoPrecios(false);
    }
  };

  // Hacemos que se actualicen los precios automáticamente al abrir la página por primera vez
  // Hacemos que se actualicen los precios automáticamente
  useEffect(() => {
    // 1. Pide los precios apenas entras a la página
    actualizarPreciosDesdeBolsa();

    // 2. Crea un temporizador que pide los precios cada 30 segundos (30000 milisegundos)
    const temporizador = setInterval(() => {
      actualizarPreciosDesdeBolsa();
    }, 30000);

    // 3. Limpieza por seguridad para que no se trabe el navegador
    return () => clearInterval(temporizador);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAgregarActivo = (e) => {
    e.preventDefault();
    const activoFormateado = {
      ticker: nuevoActivo.ticker.toUpperCase(),
      nombre: nuevoActivo.nombre || 'Nuevo Activo',
      tipo: nuevoActivo.tipo,
      cant: parseFloat(nuevoActivo.cant),
      precioCompra: parseFloat(nuevoActivo.precioCompra),
      precioActual: parseFloat(nuevoActivo.precioCompra) // Empieza igual al de compra, luego la API lo actualiza
    };

    setPosiciones([...posiciones, activoFormateado]);
    setIsModalOpen(false);
    setNuevoActivo({ ticker: '', nombre: '', tipo: 'Acción', cant: '', precioCompra: '' });
  };

  // --- CÁLCULOS DINÁMICOS DEL PORTAFOLIO ---
  let balanceTotal = 0;
  let costoTotal = 0;
  const distribucionMap = { 'Acción': 0, 'ETF': 0, 'Renta Fija': 0, 'Cripto': 0 };

  posiciones.forEach(pos => {
    const valorActual = pos.cant * pos.precioActual;
    const valorCompra = pos.cant * pos.precioCompra;
    balanceTotal += valorActual;
    costoTotal += valorCompra;
    if (distribucionMap[pos.tipo] !== undefined) distribucionMap[pos.tipo] += valorActual;
  });

  const rendimientoHistorico = balanceTotal - costoTotal;
  const porcentajeHistorico = costoTotal > 0 ? (rendimientoHistorico / costoTotal) * 100 : 0;

  const coloresTipo = { 'Acción': '#3b82f6', 'ETF': '#22c55e', 'Renta Fija': '#f59e0b', 'Cripto': '#a855f7' };
  const datosDistribucion = Object.keys(distribucionMap).filter(key => distribucionMap[key] > 0).map(key => ({
    name: key, value: Math.round(distribucionMap[key]), color: coloresTipo[key]
  }));

  return (
    <div className="min-h-screen bg-[#121212] font-sans text-white">
      {/* Navegación */}
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
            <div className="relative hidden lg:block">
              <input type="text" placeholder="Buscar ticker..." className="bg-[#1E1E1E] text-gray-300 text-sm rounded-full px-4 py-2 border border-gray-700 focus:outline-none focus:border-green-500 transition-colors w-64" />
              <span className="absolute right-3 top-2 text-gray-500">🔍</span>
            </div>
            <button className="w-9 h-9 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700 hover:border-gray-500 transition-colors">
              <span className="text-gray-300 text-sm">👤</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10 relative">

        {/* PESTAÑA SIMULADOR (Resumida para espacio) */}
        {tabActiva === 'simulador' && (
          <div className="text-center mt-20"><h2 className="text-2xl text-green-400">Ve a Mi Portafolio para probar la conexión a la Bolsa.</h2></div>
        )}

        {/* PESTAÑA PORTAFOLIO */}
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
                <button
                  onClick={actualizarPreciosDesdeBolsa}
                  disabled={cargandoPrecios}
                  className="bg-[#1E1E1E] border border-gray-700 hover:border-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                  🔄 Actualizar
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-green-500 hover:bg-green-600 text-[#121212] font-bold py-2 px-6 rounded-lg transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                  + Agregar Activo
                </button>
              </div>
            </div>

            {/* Tarjetas */}
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

            {/* Gráfico y Tabla */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg flex flex-col">
                <h3 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">Distribución</h3>
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
              </div>

              <div className="lg:col-span-2 bg-[#1E1E1E] p-6 rounded-2xl border border-gray-800 shadow-lg overflow-x-auto">
                <h3 className="text-lg font-semibold mb-6 border-b border-gray-700 pb-2">Tus Posiciones</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="pb-3 font-medium">Activo</th>
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium text-right">Cant.</th>
                      <th className="pb-3 font-medium text-right">Precio Compra</th>
                      <th className="pb-3 font-medium text-right">Precio Actual</th>
                      <th className="pb-3 font-medium text-right">Retorno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posiciones.map((pos, index) => {
                      const retornoPct = ((pos.precioActual - pos.precioCompra) / pos.precioCompra) * 100;
                      return (
                        <tr key={index} className="border-b border-gray-800 hover:bg-[#252525] transition-colors">
                          <td className="py-4">
                            <div className="font-bold text-white">{pos.ticker}</div>
                            <div className="text-xs text-gray-500">{pos.nombre}</div>
                          </td>
                          <td className="py-4 text-gray-300"><span className="bg-gray-800 px-2 py-1 rounded text-xs">{pos.tipo}</span></td>
                          <td className="py-4 text-right font-mono text-gray-300">{pos.cant}</td>
                          <td className="py-4 text-right font-mono text-gray-300">${pos.precioCompra.toFixed(2)}</td>
                          <td className="py-4 text-right font-mono text-white ${cargandoPrecios ? 'animate-pulse' : ''}">${pos.precioActual.toFixed(2)}</td>
                          <td className="py-4 text-right font-mono">
                            <span className={`px-2 py-1 rounded-md font-bold ${retornoPct >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {retornoPct >= 0 ? '+' : ''}{retornoPct.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Agregar (Oculto en código para no alargar más el texto, asume que está el mismo del paso anterior) */}
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
                <div><label className="text-xs text-gray-400 mb-1 block">Precio Compra</label><input required type="number" step="any" min="0" value={nuevoActivo.precioCompra} onChange={(e) => setNuevoActivo({ ...nuevoActivo, precioCompra: e.target.value })} className="w-full bg-[#121212] border border-gray-700 rounded-lg p-2.5 text-white" /></div>
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