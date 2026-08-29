/**
 * Every piece of text the user reads, in Venezuelan Spanish.
 *
 * Keeping copy out of the rendering code means wording can be reviewed and
 * adjusted without reading a single line of logic. The keys are English so
 * they match the identifiers used elsewhere in the codebase.
 */

export const strings = {
  verdicts: {
    waiting: {
      emoji: '🩺',
      title: 'Esperando datos…',
      detail: 'Escribe el monto y la tasa del comercio.',
    },
    bargain: {
      emoji: '🤑',
      title: '¡Te están dando chance!',
      detail: 'El comercio te cobra por debajo de la referencia. Aprovecha.',
    },
    safe: {
      emoji: '😇',
      title: 'Todo legal, respira',
      detail: 'Prácticamente la misma tasa de referencia. Paga tranquilo.',
    },
    fair: {
      emoji: '🙂',
      title: 'Cobro justo',
      detail: 'Diferencia mínima, dentro de lo normal del mercado.',
    },
    mild: {
      emoji: '🤨',
      title: 'Te están clavando un poquito',
      detail: 'Sobreprecio leve. Si el monto es grande, se siente.',
    },
    painful: {
      emoji: '😰',
      title: 'Ay papá, eso duele',
      detail: 'Sobreprecio considerable. Pregunta el precio en divisas antes de pagar.',
    },
    severe: {
      emoji: '🚑',
      title: '¡Llamen a la ambulancia!',
      detail: 'Te están cobrando muchísimo por encima de la referencia.',
    },
    critical: {
      emoji: '💀',
      title: 'Código azul, traigan el desfibrilador',
      detail: 'Esto ya no es una tasa, es un atraco con calculadora.',
    },
  },

  merchant: {
    impliedHint:
      'Nadie canta su tasa, pero todos cantan un precio. Escribe lo que te dicen ' +
      'que cuesta en dólares y saco la tasa que te están aplicando.',
    implied: (rate) =>
      `Te están aplicando <b>Bs. ${rate} por dólar</b>. Esa es la tasa que compara el infartómetro.`,
  },

  rateLabels: {
    merchant: 'A la tasa del comercio',
    official: 'A tasa BCV',
    parallel: 'A tasa paralela',
  },

  rateCaptions: {
    merchant: 'Lo que te están cobrando',
    official: 'Tasa oficial',
    parallel: 'Tasa del mercado',
  },

  referenceNames: {
    official: 'BCV',
    parallel: 'paralela',
  },

  status: {
    loading: 'Consultando tasas…',
    loadingDetail: 'Conectando con la fuente',
    live: 'Tasas en vivo',
    stale: 'Tasas guardadas (sin refrescar)',
    offline: 'Sin conexión con la fuente',
    offlineDetail: 'Puedes escribir las tasas a mano',
    euroPending: 'Tasas del euro: pendientes de la primera consulta.',
    euroUnavailable: 'No hay tasa del euro disponible ahora mismo.',
  },

  gauge: {
    overchargeAgainst: (reference) => `Sobreprecio vs. ${reference}`,
    discountAgainst: (reference) => `Descuento vs. ${reference}`,
    idle: 'Sobreprecio vs. referencia',
    ariaLabel: (percent, reference) =>
      percent === null
        ? 'Medidor de sobreprecio sin datos suficientes'
        : `Sobreprecio de ${percent} por ciento frente a la tasa ${reference}`,
  },

  comparison: {
    overcharge: (percent) => `▲ ${percent}% de sobreprecio`,
    discount: (percent) => `▼ ${percent}% a tu favor`,
  },

  toasts: {
    ratesUpdated: 'Tasas actualizadas ✅',
    ratesFailedWithCache: 'No se pudo conectar. Mostrando la última tasa guardada.',
    ratesFailedNoCache: 'No se pudo conectar. Escribe las tasas a mano.',
    autoRateOn: 'Tasa automática activada',
    autoRateOff: 'Tasa en modo manual',
    persistenceOn: 'Tus datos se guardarán en este navegador',
    persistenceOff: 'Ya no se guardarán tus datos',
    autoRefreshOn: 'Se refrescará cada 10 minutos',
    autoRefreshOff: 'Refresco automático apagado',
    cleared: 'Datos borrados. Las tasas siguen en automático.',
  },

  rateModes: {
    auto: 'auto',
    manual: 'manual',
    autoHint: 'Tasa tomada de la fuente en vivo. Click para editarla a mano.',
    manualHint: 'Tasa escrita por ti. Click para volver a la automática.',
  },

  emptyResults: 'Escribe un monto y te digo cuánto es.',

  theme: {
    toLight: 'Cambiar a tema claro',
    toDark: 'Cambiar a tema oscuro',
    lightIcon: '☀️',
    darkIcon: '🌙',
  },

  time: {
    justNow: 'hace segundos',
    minutes: (n) => `hace ${n} min`,
    hours: (n) => `hace ${n} h`,
    days: (n) => `hace ${n} d`,
  },
};
