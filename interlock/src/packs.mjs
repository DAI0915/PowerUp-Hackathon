// Policy packs. Each pack is a plain policy object for evaluate(), classifySilence() and checkBehaviour().
// Keys are demo stand-ins (see engine.mjs signatures note); real deployments hold per-sender public keys.

export const DEMO_KEYS = {
  'base-optimizer': 'k-opt-7f3a',   // our fleet optimizer (aggregator cloud)
  'site-ems': 'k-ems-19c2',         // on-site energy manager (installation pack)
  'sce-drms': 'k-sce-44d1',         // utility demand-response system
  'caiso-market': 'k-mkt-08be',     // market interface
  'vendor-cloud': 'k-ven-5521',     // a vendor's cloud integration
};

const COMMON = {
  capacityKWh: 39.2, maxKw: 20,          // REAL: Base Core
  medicalFloorPct: 0.5,
  heartbeatTimeoutSec: 90,
  maxAgeMin: 15, maxFutureMin: 2,
  canaryHomes: 600, canaryMW: 5, canaryStages: [0.01, 0.1, 1], canaryTolKw: 1, canaryTolFrac: 0.25,
  clusterFrac: 0.5, minClusterSize: 5,
  faultRecentSec: 900, tempDriftC: 8, deepDischargePct: 3,
  stuckSamples: 3, driftTolKWh: 2, deviationKw: 2,
  cohortFrac: 0.3, minCohort: 5, cohortBy: ['firmware', 'circuit'],
  lastSafePlanTtlMin: 1440, lastSafePlanRechargeKw: 2,
  humanDelayMin: 10,
  envelope: null,
};

const src = (role, id) => ({ role, key: DEMO_KEYS[id] });

export const PACKS = {
  sce: {
    ...COMMON,
    name: 'sce',
    label: 'SCE default',
    description: 'Default pack for an SCE-territory fleet: 20% backup floor (50% for medical homes), 90 s heartbeat, 15 min command age limit, canary for big orders.',
    floorPct: 0.2,
    twoPersonFleetWide: false,
    allowedRoles: ['aggregator', 'market', 'utility', 'vendor'],
    trustedSources: {
      'base-optimizer': src('aggregator', 'base-optimizer'),
      'sce-drms': src('utility', 'sce-drms'),
      'caiso-market': src('market', 'caiso-market'),
      'vendor-cloud': src('vendor', 'vendor-cloud'),
    },
    optimizerSource: { id: 'base-optimizer', role: 'aggregator' },
  },
  installation: {
    ...COMMON,
    name: 'installation',
    label: 'Installation (strict)',
    description: 'Strict military-installation pack: only the utility and the on-site energy manager may command batteries; vendor and market clouds are held; every fleet-wide order goes to a person; 40% floor.',
    floorPct: 0.4,
    medicalFloorPct: 0.6,
    canaryHomes: 200, canaryMW: 2,
    twoPersonFleetWide: true,
    twoPersonIncludesUtility: true,
    allowedRoles: ['utility', 'local'],
    trustedSources: {
      'site-ems': src('local', 'site-ems'),
      'sce-drms': src('utility', 'sce-drms'),
    },
    optimizerSource: { id: 'site-ems', role: 'local' },
  },
  australia: {
    ...COMMON,
    name: 'australia',
    label: 'Australia DOE (illustrative)',
    description: 'Illustrative dynamic-operating-envelope pack: each circuit import/export limit is recomputed every 5 minutes; tighter export at midday (solar), wider in the evening.',
    floorPct: 0.2,
    twoPersonFleetWide: false,
    allowedRoles: ['aggregator', 'market', 'utility', 'vendor'],
    trustedSources: {
      'base-optimizer': src('aggregator', 'base-optimizer'),
      'sce-drms': src('utility', 'sce-drms'),
      'caiso-market': src('market', 'caiso-market'),
      'vendor-cloud': src('vendor', 'vendor-cloud'),
    },
    optimizerSource: { id: 'base-optimizer', role: 'aggregator' },
    // ILLUSTRATIVE envelope: recomputed every 5 min from the circuit's static limits.
    envelope(circuit, nowMin) {
      const t = Math.floor(nowMin / 5) * 5;
      const midday = t >= 600 && t < 900;
      const evening = t >= 960 && t < 1260;
      return {
        importLimitMW: circuit.importLimitMW * (evening ? 1.0 : 0.97),
        exportCapMW: midday ? -0.5 : evening ? -2.5 : circuit.exportCapMW,
      };
    },
  },
};

export function getPack(name = 'sce', overrides = {}) {
  const p = PACKS[name];
  if (!p) throw new Error(`unknown pack "${name}"`);
  return { ...p, ...overrides };
}
