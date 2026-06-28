import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, font } from '../theme';
import { DealInputs, DealExtras, Strategy, Ownership, RefurbMode, FeeMode, DEFAULT_INPUTS } from '../types';
import { calcDeal } from '../engine/dealEngine';
import { InputField } from '../components/InputField';
import { SliderField } from '../components/SliderField';
import { ResultRow, SectionDivider, fmtGbp, fmtPct } from '../components/ResultRow';

interface ForwardRateTenor { baseRate: number; btlRate: number; }
interface MarketData {
  fetchedAt: string;
  baseRate: { value: number; source: string };
  btlMortgageRate: { value: number; source: string };
  forwardRates?: {
    yr1: ForwardRateTenor;
    yr2: ForwardRateTenor;
    yr5: ForwardRateTenor;
    source: string;
  };
  housePriceGrowth: { value: number; source: string };
  rentalGrowth: { value: number; source: string };
}

const STRATEGIES: { key: Strategy; label: string; color: string }[] = [
  { key: 'btl', label: 'Buy-to-Let', color: colors.btl },
  { key: 'hmo', label: 'HMO', color: colors.hmo },
  { key: 'stl', label: 'STL / AirBnB', color: colors.stl },
];

interface SavedDeal {
  id: number;
  label: string;
  strategy: Strategy;
  totalInvested: number;
  capitalLeftIn?: number;
  cashOnCash: number;
  monthlyNetCashflow: number;
  grossYield: number;
  netYield: number;
  stampDuty: number;
  monthlyMortgage: number;
  fiveYearTotalReturn?: number;
  floodRiskLevel?: 'low' | 'medium' | 'high';
  inputs: DealInputs;
}

type ForwardRates = NonNullable<MarketData['forwardRates']>;

function getForwardRateForTerm(termStr: string, fwd: ForwardRates): { btlRate: number; baseRate: number; tenorLabel: string } {
  const t = Math.round(parseFloat(termStr) || 2);
  if (t <= 1) return { ...fwd.yr1, tenorLabel: '1yr' };
  if (t <= 2) return { ...fwd.yr2, tenorLabel: '2yr' };
  if (t < 5) {
    const frac = (t - 2) / 3;
    return {
      btlRate: Math.round((fwd.yr2.btlRate + frac * (fwd.yr5.btlRate - fwd.yr2.btlRate)) * 10) / 10,
      baseRate: Math.round((fwd.yr2.baseRate + frac * (fwd.yr5.baseRate - fwd.yr2.baseRate)) * 10) / 10,
      tenorLabel: `${t}yr`,
    };
  }
  return { ...fwd.yr5, tenorLabel: '5yr+' };
}

type CustomItem = { id: string; label: string; amount: string };

let _nextId = 1;
function newItem(): CustomItem {
  return { id: String(_nextId++), label: '', amount: '' };
}

function updateItem(
  items: CustomItem[],
  id: string,
  field: 'label' | 'amount',
  value: string,
): CustomItem[] {
  return items.map(i => (i.id === id ? { ...i, [field]: value } : i));
}

function sumItems(items: CustomItem[]): number {
  return items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSchoolType(tags: Record<string, string>): string {
  const s = tags.school || '';
  if (s === 'primary') return 'Primary';
  if (s === 'secondary') return 'Secondary';
  if (s === 'sixth_form' || s === 'college') return 'Sixth Form';
  if (s === 'special') return 'Special';
  const isced = tags['isced:level'] || '';
  if (isced.includes('0') || isced.includes('1')) return 'Primary';
  if (isced.includes('2') || isced.includes('3')) return 'Secondary';
  return 'School';
}

const UK_HPI: Record<number, number> = { 2019: 234000, 2020: 250000, 2021: 274000, 2022: 293000, 2023: 285000, 2024: 290000 };

function CustomItemRows({
  items,
  onChange,
  placeholder,
  monthly,
}: {
  items: CustomItem[];
  onChange: React.Dispatch<React.SetStateAction<CustomItem[]>>;
  placeholder: string;
  monthly?: boolean;
}) {
  return (
    <>
      {items.map(item => (
        <View key={item.id} style={styles.customRow}>
          <TextInput
            style={styles.customLabel}
            value={item.label}
            onChangeText={v => onChange(prev => updateItem(prev, item.id, 'label', v))}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.customAmount}
            value={item.amount}
            onChangeText={v => onChange(prev => updateItem(prev, item.id, 'amount', v))}
            placeholder={monthly ? '£/mo' : '£0'}
            keyboardType="numeric"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => onChange(prev => prev.filter(i => i.id !== item.id))}
          >
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={() => onChange(prev => [...prev, newItem()])}>
        <Text style={styles.addBtnText}>+ Add cost</Text>
      </TouchableOpacity>
    </>
  );
}

export function CalculatorScreen() {
  const [inputs, setInputs] = useState<DealInputs>(DEFAULT_INPUTS);
  const [showSdlt, setShowSdlt] = useState(false);
  const [showStress, setShowStress] = useState(false);
  const [showProjection, setShowProjection] = useState(false);
  const [customRefurb, setCustomRefurb] = useState<CustomItem[]>([]);
  const [customStlSetup, setCustomStlSetup] = useState<CustomItem[]>([]);
  const [customStlMonthly, setCustomStlMonthly] = useState<CustomItem[]>([]);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [savedDeals, setSavedDeals] = useState<SavedDeal[]>([]);
  const [editingDealId, setEditingDealId] = useState<number | null>(null);
  const [view, setView] = useState<'calculator' | 'duediligence' | 'saved' | 'guide'>('calculator');
  const [ddTab, setDdTab] = useState<'sold' | 'flood' | 'planning' | 'epc' | 'crime' | 'transport' | 'rental' | 'employment' | 'hmo' | 'schools' | 'groundrisk'>('sold');

  type SoldSale = { price: number; date: string; type: string; tenure: string; newBuild: boolean; address: string };
  const [soldPostcode, setSoldPostcode] = useState('');
  const [soldPrices, setSoldPrices] = useState<SoldSale[] | null>(null);
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldError, setSoldError] = useState<string | null>(null);

  type FloodRisk = {
    level: 'low' | 'medium' | 'high';
    zone: 1 | 2 | 3;
    zoneLabel: string;
    annualProbability: string;
    fiveYearProbability: string;
    floodTypes: string[];
    postcode: string;
  };
  const [floodRisk, setFloodRisk] = useState<FloodRisk | null>(null);
  const [floodLoading, setFloodLoading] = useState(false);

  type PlanningApp = { reference: string; address: string; description: string; status: string; type: string; date: string; decisionDate: string; url: string; distanceM: number | null };
  const [planningPostcode, setPlanningPostcode] = useState('');
  const [planningCouncil, setPlanningCouncil] = useState('');
  const [planningData, setPlanningData] = useState<PlanningApp[] | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [planningNote, setPlanningNote] = useState<string | null>(null);

  type EpcResult = { address: string; rating: string; validUntil: string; expired: boolean; certUrl: string; floorArea: string | null };
  const [epcData, setEpcData] = useState<EpcResult[] | null>(null);
  const [epcLoading, setEpcLoading] = useState(false);
  const [epcError, setEpcError] = useState<string | null>(null);

  type CrimeBreakdown = { category: string; label: string; count: number; perMonth: number };
  type CrimeData = { level: string; colour: string; avgPerMonth: number; monthsAnalysed: number; breakdown: CrimeBreakdown[]; note: string | null };
  const [crimeData, setCrimeData] = useState<CrimeData | null>(null);
  const [crimeLoading, setCrimeLoading] = useState(false);
  const [crimeError, setCrimeError] = useState<string | null>(null);

  type TransportStop = { name: string; type: string; distanceKm: number; walkMins: number };
  type TransportData = { stops: TransportStop[]; note: string | null };
  const [transportData, setTransportData] = useState<TransportData | null>(null);
  const [transportLoading, setTransportLoading] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);

  type RentalRate = { label: string; weeklyRate: number | null; monthlyRate: number | null };
  type OnsRent = { median: number | null; uq: number | null };
  type OnsMedians = { area: string; rents: Record<string, OnsRent> };
  type UKAverage = { employmentRate: number | null; unemploymentRate: number | null; inactivityRate: number | null };
  type Employment = { area: string | null; employmentRate: number | null; unemploymentRate: number | null; inactivityRate: number | null; ukAverage?: UKAverage | null };
  type RentalData = { brmaName: string | null; lha: Record<string, RentalRate>; onsMedians: OnsMedians | null; employment?: Employment | null };
  const [rentalData, setRentalData] = useState<RentalData | null>(null);
  const [rentalLoading, setRentalLoading] = useState(false);
  const [rentalError, setRentalError] = useState<string | null>(null);

  type Article4Area = { name: string; startDate: string };
  type HmoData = { isArticle4: boolean; areas: Article4Area[]; council: string | null };
  const [hmoData, setHmoData] = useState<HmoData | null>(null);
  const [hmoLoading, setHmoLoading] = useState(false);
  const [hmoError, setHmoError] = useState<string | null>(null);

  type School = { name: string; type: string; distanceKm: number | null; ofstedRating?: string; ofstedFormat?: string; subAspect?: string | null; reportDate?: string | null; reportUrl?: string; urn?: string };
  const [schoolsData, setSchoolsData] = useState<School[] | null>(null);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);

  type GroundRiskData = {
    coal: { highRisk: boolean; surfaceMining: boolean; coalResource: boolean; reportingArea: boolean };
    hazards: { landslideFound: boolean; surfaceGeology: string | null };
  };
  const [groundRiskData, setGroundRiskData] = useState<GroundRiskData | null>(null);
  const [groundRiskLoading, setGroundRiskLoading] = useState(false);
  const [groundRiskError, setGroundRiskError] = useState<string | null>(null);

  const [ddPostcode, setDdPostcode] = useState('');

  function formatPostcode(raw: string): string {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length >= 5 && cleaned.length <= 7) {
      return cleaned.slice(0, -3) + ' ' + cleaned.slice(-3);
    }
    return cleaned;
  }

  function isValidPostcode(pc: string): boolean {
    return /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(pc);
  }

  function lookupSoldPrices(overridePostcode?: string) {
    const pc = formatPostcode(overridePostcode ?? soldPostcode);
    if (!isValidPostcode(pc)) {
      setSoldError('Enter a valid UK postcode, e.g. SW1A 2AA');
      return;
    }
    setSoldPostcode(pc);
    setSoldLoading(true);
    setSoldError(null);
    setSoldPrices(null);
    fetch(`https://sold-prices.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) throw new Error(d.error);
        setSoldPrices(d.sales ?? []);
      })
      .catch(e => setSoldError(e.message ?? 'Lookup failed'))
      .finally(() => setSoldLoading(false));
    // Fetch flood risk for this postcode if different from current
    if (floodRisk?.postcode !== pc) {
      setFloodRisk(null);
      setFloodLoading(true);
      fetch(`https://flood-risk.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
        .then(r => r.json())
        .then((d: any) => { if (!d.error) setFloodRisk({ level: d.level, zone: d.zone ?? 1, zoneLabel: d.zoneLabel ?? '', annualProbability: d.annualProbability ?? '', fiveYearProbability: d.fiveYearProbability ?? '', floodTypes: d.floodTypes ?? [], postcode: pc }); })
        .catch(() => {})
        .finally(() => setFloodLoading(false));
    }
  }

  function lookupAllDd() {
    const pc = formatPostcode(ddPostcode);
    if (!isValidPostcode(pc)) {
      setSoldError('Enter a valid UK postcode, e.g. SW1A 2AA');
      return;
    }
    setDdPostcode(pc);
    setSoldPostcode(pc);
    setPlanningPostcode(pc);
    // Sold prices
    setSoldLoading(true); setSoldError(null); setSoldPrices(null);
    fetch(`https://sold-prices.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) throw new Error(d.error); setSoldPrices(d.sales ?? []); })
      .catch(e => setSoldError(e.message ?? 'Lookup failed'))
      .finally(() => setSoldLoading(false));
    // Flood risk
    if (floodRisk?.postcode !== pc) {
      setFloodRisk(null); setFloodLoading(true);
      fetch(`https://flood-risk.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
        .then(r => r.json())
        .then((d: any) => { if (!d.error) setFloodRisk({ level: d.level, zone: d.zone ?? 1, zoneLabel: d.zoneLabel ?? '', annualProbability: d.annualProbability ?? '', fiveYearProbability: d.fiveYearProbability ?? '', floodTypes: d.floodTypes ?? [], postcode: pc }); })
        .catch(() => {}).finally(() => setFloodLoading(false));
    }
    // Planning
    setPlanningLoading(true); setPlanningError(null); setPlanningData(null); setPlanningNote(null); setPlanningCouncil('');
    fetch(`https://planning.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) throw new Error(d.error); setPlanningData(d.applications ?? []); setPlanningNote(d.note ?? null); setPlanningCouncil(d.council ?? ''); })
      .catch(e => setPlanningError(e.message ?? 'Lookup failed'))
      .finally(() => setPlanningLoading(false));
    // EPC ratings
    setEpcLoading(true); setEpcError(null); setEpcData(null);
    fetch(`https://epc.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) throw new Error(d.error); setEpcData(d.results ?? []); })
      .catch(e => setEpcError(e.message ?? 'Lookup failed'))
      .finally(() => setEpcLoading(false));
    // Crime
    setCrimeLoading(true); setCrimeError(null); setCrimeData(null);
    fetch(`https://crime.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) throw new Error(d.error); setCrimeData(d); })
      .catch(e => setCrimeError(e.message ?? 'Lookup failed'))
      .finally(() => setCrimeLoading(false));
    // Transport
    setTransportLoading(true); setTransportError(null); setTransportData(null);
    fetch(`https://transport.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) throw new Error(d.error); setTransportData(d); })
      .catch(e => setTransportError(e.message ?? 'Lookup failed'))
      .finally(() => setTransportLoading(false));
    // Rental benchmarks (LHA)
    setRentalLoading(true); setRentalError(null); setRentalData(null);
    fetch(`https://rental.nanoluke521.workers.dev/?v=5&postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) throw new Error(d.error); setRentalData(d); })
      .catch(e => setRentalError(e.message ?? 'Lookup failed'))
      .finally(() => setRentalLoading(false));
    // HMO Article 4 + Schools — both require geocoding
    setHmoLoading(true); setHmoError(null); setHmoData(null);
    setSchoolsLoading(true); setSchoolsError(null); setSchoolsData(null);
    fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then(async (geo: any) => {
        if (!geo.result) throw new Error('Postcode geocoding failed');
        const lat: number = geo.result.latitude;
        const lng: number = geo.result.longitude;
        const council: string | null = geo.result.admin_district ?? null;
        // Article 4 Direction
        fetch(`https://www.planning.data.gov.uk/entity.json?dataset=article-4-direction-area&entries=current&geometry=POINT(${lng}+${lat})&geometry_relation=intersects&limit=20`)
          .then(r => r.json())
          .then((a4: any) => {
            const entities: any[] = a4.entities ?? [];
            setHmoData({
              isArticle4: entities.length > 0,
              areas: entities.map((e: any) => ({ name: e.name || e['article-4-direction'] || 'Unknown', startDate: e['start-date'] || '' })),
              council,
            });
          })
          .catch(e => setHmoError(e.message ?? 'Article 4 lookup failed'))
          .finally(() => setHmoLoading(false));
        // Schools + Ofsted ratings via Cloudflare Worker (scrapes reports.ofsted.gov.uk)
        fetch(`https://schools.nanoluke521.workers.dev/?lat=${lat}&lon=${lng}&radius=2`)
          .then(r => r.json())
          .then((d: any) => {
            if (d.error) throw new Error(d.error);
            setSchoolsData((d.schools ?? []).slice(0, 10));
          })
          .catch(e => setSchoolsError(e.message ?? 'Schools lookup failed'))
          .finally(() => setSchoolsLoading(false));
      })
      .catch(e => {
        setHmoError(e.message ?? 'Geocoding failed'); setHmoLoading(false);
        setSchoolsError(e.message ?? 'Geocoding failed'); setSchoolsLoading(false);
      });
    // Ground Risk — Coal Authority WMS + BGS hazards (uses geocoded lat/lng from postcodes.io)
    setGroundRiskLoading(true); setGroundRiskError(null); setGroundRiskData(null);
    fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then(async (geo: any) => {
        if (!geo.result) throw new Error('Postcode not found');
        const lat: number = geo.result.latitude;
        const lng: number = geo.result.longitude;
        const d = 0.01;
        const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
        const wmsBase = 'https://map.bgs.ac.uk/arcgis/services/CoalAuthority/coalauthority_planning_policy_constraints/MapServer/WMSServer';
        const bgsHazBase = 'https://map.bgs.ac.uk/arcgis/services/GeoIndex_Onshore/hazards/MapServer/WMSServer';
        const bgsEngBase = 'https://map.bgs.ac.uk/arcgis/services/EngineeringWebGIS/EngineeringWebGIS/MapServer/WMSServer';
        function wmsUrl(base: string, layer: string) {
          return `${base}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=${encodeURIComponent(layer)}&QUERY_LAYERS=${encodeURIComponent(layer)}&BBOX=${bbox}&SRS=EPSG:4326&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=text/plain`;
        }
        function wmsHit(text: string): boolean {
          return !text.includes('No features found') && text.trim().length > 0;
        }
        const [highRiskTxt, surfMineTxt, coalResTxt, reportTxt, landslideTxt, supGeolTxt] = await Promise.all([
          fetch(wmsUrl(wmsBase, 'Development.High.Risk.Area')).then(r => r.text()).catch(() => ''),
          fetch(wmsUrl(wmsBase, 'Surface.Mining.Past.and.Current')).then(r => r.text()).catch(() => ''),
          fetch(wmsUrl(wmsBase, 'Surface.Coal.Resource.Areas')).then(r => r.text()).catch(() => ''),
          fetch(wmsUrl(wmsBase, 'Coal.Mining.Reporting.Area')).then(r => r.text()).catch(() => ''),
          fetch(wmsUrl(bgsHazBase, 'Landslides')).then(r => r.text()).catch(() => ''),
          fetch(wmsUrl(bgsEngBase, '_:1M_Superficial_Engineering_Geology38490')).then(r => r.text()).catch(() => ''),
        ]);
        let surfaceGeology: string | null = null;
        if (supGeolTxt && !supGeolTxt.includes('No features found')) {
          const match = supGeolTxt.match(/ENG_DESC[^;]*;([^;]+);/);
          if (!match) {
            const parts = supGeolTxt.split(';');
            const hdrIdx = parts.findIndex(p => p.includes('ENG_DESC'));
            if (hdrIdx >= 0 && parts.length > hdrIdx + 4) surfaceGeology = parts[hdrIdx + 4]?.trim() || null;
          } else {
            surfaceGeology = match[1]?.trim() || null;
          }
          if (!surfaceGeology) {
            const lines = supGeolTxt.split('\n').filter(l => l.trim());
            if (lines.length >= 2) {
              const hdr = lines[0].split(';').map((h: string) => h.trim());
              const vals = lines[1].split(';').map((v: string) => v.trim());
              const idx = hdr.indexOf('ENG_DESC');
              if (idx >= 0 && vals[idx]) surfaceGeology = vals[idx];
            }
          }
        }
        setGroundRiskData({
          coal: { highRisk: wmsHit(highRiskTxt), surfaceMining: wmsHit(surfMineTxt), coalResource: wmsHit(coalResTxt), reportingArea: wmsHit(reportTxt) },
          hazards: { landslideFound: wmsHit(landslideTxt), surfaceGeology },
        });
      })
      .catch(e => setGroundRiskError(e.message ?? 'Ground risk lookup failed'))
      .finally(() => setGroundRiskLoading(false));
  }

  useEffect(() => {
    fetch('./market-data.json')
      .then(r => r.json())
      .then((d: MarketData) => {
        setMarketData(d);
        setInputs(prev => ({
          ...prev,
          interestRate: String(d.btlMortgageRate.value),
          capitalGrowthPct: String(d.housePriceGrowth.value),
          annualIncomeIncreasePct: String(d.rentalGrowth.value),
        }));
      })
      .catch(() => {});
  }, []);

  // Recalculate expected future rate whenever initial term or market data changes
  useEffect(() => {
    if (!marketData?.forwardRates) return;
    const { btlRate } = getForwardRateForTerm(inputs.mortgageInitialTerm, marketData.forwardRates);
    setInputs(prev => ({ ...prev, mortgageFutureRate: String(btlRate) }));
  }, [inputs.mortgageInitialTerm, marketData]);

  useEffect(() => {
    const pc = formatPostcode(inputs.postcode);
    if (!isValidPostcode(pc)) { setFloodRisk(null); return; }
    if (floodRisk?.postcode === pc) return;
    const timer = setTimeout(() => {
      setFloodLoading(true);
      fetch(`https://flood-risk.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
        .then(r => r.json())
        .then((d: any) => { if (!d.error) setFloodRisk({ level: d.level, zone: d.zone ?? 1, zoneLabel: d.zoneLabel ?? '', annualProbability: d.annualProbability ?? '', fiveYearProbability: d.fiveYearProbability ?? '', floodTypes: d.floodTypes ?? [], postcode: pc }); })
        .catch(() => {})
        .finally(() => setFloodLoading(false));
    }, 800);
    return () => clearTimeout(timer);
  }, [inputs.postcode]);

  function lookupPlanning() {
    const raw = planningPostcode || soldPostcode || ddPostcode;
    const pc = formatPostcode(raw);
    if (!isValidPostcode(pc)) {
      setPlanningError('Enter a valid UK postcode, e.g. SW1A 2AA');
      return;
    }
    setPlanningPostcode(pc);
    setPlanningLoading(true);
    setPlanningError(null);
    setPlanningData(null);
    setPlanningNote(null);
    setPlanningCouncil('');
    fetch(`https://planning.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) throw new Error(d.error);
        setPlanningData(d.applications ?? []);
        setPlanningNote(d.note ?? null);
        setPlanningCouncil(d.council ?? '');
      })
      .catch(e => setPlanningError(e.message ?? 'Lookup failed'))
      .finally(() => setPlanningLoading(false));
  }

  function exportCSV() {
    if (savedDeals.length === 0) return;
    const headers = ['Label', 'Strategy', 'Purchase Price', 'Monthly Rent', 'Total Invested', 'Capital Left In', 'Monthly Cashflow', 'Gross Yield %', 'Net Yield %', 'Cash-on-Cash %', 'Monthly Mortgage', 'Stamp Duty'];
    const rows = savedDeals.map(d => [
      d.label,
      d.strategy,
      d.inputs.purchasePrice,
      d.inputs.strategy === 'hmo' ? String(Number(d.inputs.hmoRooms) * Number(d.inputs.hmoRentPerRoom)) : (d.inputs.rentPerMonth || ''),
      String(Math.round(d.totalInvested)),
      d.capitalLeftIn != null ? String(Math.round(d.capitalLeftIn)) : '',
      String(Math.round(d.monthlyNetCashflow)),
      String(d.grossYield.toFixed(2)),
      String(d.netYield.toFixed(2)),
      String(d.cashOnCash.toFixed(2)),
      String(Math.round(d.monthlyMortgage)),
      String(Math.round(d.stampDuty)),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'property-deals.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function set(field: keyof DealInputs) {
    return (val: string) => setInputs(prev => ({ ...prev, [field]: val }));
  }

  function saveDeal() {
    if (!results) return;
    const label = [inputs.houseNumber, inputs.postcode].filter(Boolean).join(', ');
    setSavedDeals(prev => {
      const next = [...prev, {
        id: Date.now(),
        label: label || `Deal ${prev.length + 1}`,
        strategy: inputs.strategy,
        totalInvested: results.totalInvested,
        capitalLeftIn: results.capitalLeftIn,
        cashOnCash: results.cashOnCash,
        monthlyNetCashflow: results.monthlyNetCashflow,
        grossYield: results.grossYield,
        netYield: results.netYield,
        stampDuty: results.stampDuty,
        monthlyMortgage: results.monthlyMortgage,
        fiveYearTotalReturn: results.projection5yr.totalReturn,
        floodRiskLevel: floodRisk?.postcode && formatPostcode(inputs.postcode) === floodRisk.postcode ? floodRisk.level : undefined,
        inputs: { ...inputs },
      }];
      return next;
    });
    setView('saved');
  }

  function updateDeal() {
    if (!results || editingDealId === null) return;
    const label = [inputs.houseNumber, inputs.postcode].filter(Boolean).join(', ');
    setSavedDeals(prev => prev.map(d => d.id === editingDealId ? {
      ...d,
      label: label || d.label,
      strategy: inputs.strategy,
      totalInvested: results.totalInvested,
      capitalLeftIn: results.capitalLeftIn,
      cashOnCash: results.cashOnCash,
      monthlyNetCashflow: results.monthlyNetCashflow,
      grossYield: results.grossYield,
      netYield: results.netYield,
      stampDuty: results.stampDuty,
      monthlyMortgage: results.monthlyMortgage,
      fiveYearTotalReturn: results.projection5yr.totalReturn,
      floodRiskLevel: floodRisk?.postcode && formatPostcode(inputs.postcode) === floodRisk.postcode ? floodRisk.level : d.floodRiskLevel,
      inputs: { ...inputs },
    } : d));
    setEditingDealId(null);
    setView('saved');
  }

  function loadDealForEdit(deal: SavedDeal) {
    setInputs({ ...deal.inputs });
    setEditingDealId(deal.id);
    setView('calculator');
  }

  function shareDealReport(deal: SavedDeal) {
    const stratColors: Record<string, string> = {
      BTL: '#3B82F6', BRRR: '#8B5CF6', HMO: '#F59E0B', STL: '#10B981', FLIP: '#EF4444',
    };
    const color = stratColors[deal.strategy] || '#3B82F6';
    const f = (n: number, d = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deal: ${deal.label}</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; color: #1a1a2e; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .badge { display: inline-block; background: ${color}; color: #fff; border-radius: 6px; padding: 2px 10px; font-size: 13px; font-weight: 700; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .card { background: #f8f9fa; border-radius: 8px; padding: 12px; }
  .card-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card-value { font-size: 20px; font-weight: 700; color: ${color}; }
  .card-sub { font-size: 12px; color: #888; }
  .section { margin-top: 16px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 14px; }
  .row:last-child { border-bottom: none; }
  footer { margin-top: 24px; font-size: 11px; color: #aaa; text-align: center; }
</style></head><body>
<h1>${deal.label}</h1>
<span class="badge">${deal.strategy}</span>
<div class="grid">
  <div class="card"><div class="card-label">Monthly Cash Flow</div><div class="card-value">£${f(deal.monthlyNetCashflow)}</div><div class="card-sub">net / month</div></div>
  <div class="card"><div class="card-label">Cash-on-Cash Return</div><div class="card-value">${f(deal.cashOnCash, 1)}%</div><div class="card-sub">annual yield on cash</div></div>
  <div class="card"><div class="card-label">Total Invested</div><div class="card-value">£${f(deal.totalInvested)}</div><div class="card-sub">inc. all costs</div></div>
  <div class="card"><div class="card-label">${deal.strategy === 'BRRR' ? 'Capital Left In' : 'Gross Yield'}</div><div class="card-value">${deal.strategy === 'BRRR' ? '£' + f(deal.capitalLeftIn ?? 0) : f(deal.grossYield, 1) + '%'}</div></div>
</div>
<div class="section">
  <div class="row"><span>Purchase Price</span><span>£${f(Number(deal.inputs.purchasePrice) || 0)}</span></div>
  <div class="row"><span>Monthly Rent</span><span>£${f(Number(deal.inputs.monthlyRent) || 0)}</span></div>
  <div class="row"><span>Monthly Mortgage</span><span>£${f(deal.monthlyMortgage)}</span></div>
  <div class="row"><span>Net Yield</span><span>${f(deal.netYield, 1)}%</span></div>
  <div class="row"><span>Stamp Duty</span><span>£${f(deal.stampDuty)}</span></div>
</div>
<footer>Generated by Property Deal Calculator</footer>
</body></html>`;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  }

  const extras = useMemo<DealExtras>(() => ({
    customRefurbTotal: sumItems(customRefurb),
    customStlSetupTotal: sumItems(customStlSetup),
    customStlMonthlyTotal: sumItems(customStlMonthly),
  }), [customRefurb, customStlSetup, customStlMonthly]);

  const results = useMemo(() => calcDeal(inputs, extras), [inputs, extras]);

  const stratColor = STRATEGIES.find(s => s.key === inputs.strategy)?.color ?? colors.primary;

  const futureRateLabel = inputs.mortgageFutureRate
    ? `Rates at ${inputs.mortgageFutureRate}%`
    : 'Rates +2%';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>

        {/* Header */}
        <Text style={styles.title}>Property Deal Calculator v34</Text>
        <Text style={styles.subtitle}>UK BTL · HMO · Short-Term Lets</Text>

        {/* ── DUE DILIGENCE VIEW ── */}
        {view === 'duediligence' && (
          <View>
            {/* Shared postcode entry — above sub-tab nav */}
            <View style={[styles.card, { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
              <View style={styles.soldSearchRow}>
                <TextInput
                  style={styles.soldPostcodeInput}
                  value={ddPostcode}
                  onChangeText={setDdPostcode}
                  placeholder="e.g. SW1A 2AA"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={lookupAllDd}
                />
                <TouchableOpacity
                  style={[styles.soldSearchBtn, (soldLoading || floodLoading || planningLoading || epcLoading || crimeLoading || transportLoading || hmoLoading || schoolsLoading) && styles.soldSearchBtnDisabled]}
                  onPress={lookupAllDd}
                  disabled={soldLoading || floodLoading || planningLoading || epcLoading || crimeLoading || transportLoading || hmoLoading || schoolsLoading}
                >
                  <Text style={styles.soldSearchBtnText}>{(soldLoading || floodLoading || planningLoading || epcLoading || crimeLoading || transportLoading || hmoLoading || schoolsLoading) ? '…' : 'Search'}</Text>
                </TouchableOpacity>
              </View>
              {soldError && <Text style={styles.soldError}>{soldError}</Text>}
            </View>
            {/* Sub-tab nav */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ddTabBar} contentContainerStyle={styles.ddTabBarContent}>
              {([
                { key: 'sold', label: 'Sold' },
                { key: 'flood', label: 'Flood' },
                { key: 'planning', label: 'Planning' },
                { key: 'epc', label: 'EPC' },
                { key: 'crime', label: 'Crime' },
                { key: 'transport', label: 'Transport' },
                { key: 'rental', label: 'Rental' },
                { key: 'employment', label: 'Employment' },
                { key: 'hmo', label: 'HMO' },
                { key: 'schools', label: 'Schools' },
                { key: 'groundrisk', label: 'Ground Risk' },
              ] as { key: typeof ddTab; label: string }[]).map(tab => (
                <TouchableOpacity key={tab.key} style={[styles.ddTab, ddTab === tab.key && styles.ddTabActive]} onPress={() => setDdTab(tab.key)}>
                  <Text style={[styles.ddTabText, ddTab === tab.key && styles.ddTabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Sold Prices sub-tab */}
            {ddTab === 'sold' && (
              <View>
                <View style={styles.card}>
                  {soldPrices && soldPrices.length === 0 && (
                    <Text style={styles.soldNone}>No recent sales found for this postcode.</Text>
                  )}
                  {soldPrices && soldPrices.length > 0 && (
                    <View style={styles.soldTable}>
                      <View style={styles.soldTableHeader}>
                        <Text style={[styles.soldColAddress, styles.soldHeaderText]}>Address</Text>
                        <Text style={[styles.soldColType, styles.soldHeaderText]}>Type</Text>
                        <Text style={[styles.soldColPrice, styles.soldHeaderText]}>Price</Text>
                        <Text style={[styles.soldColDate, styles.soldHeaderText]}>Date</Text>
                      </View>
                      {soldPrices.map((s, i) => (
                        <View key={i} style={[styles.soldTableRow, i % 2 === 1 && styles.soldTableRowAlt]}>
                          <Text style={styles.soldColAddress} numberOfLines={2}>{s.address}</Text>
                          <Text style={styles.soldColType} numberOfLines={1}>{s.type}{s.newBuild ? '*' : ''}</Text>
                          <Text style={styles.soldColPrice}>{fmtGbp(s.price)}</Text>
                          <Text style={styles.soldColDate}>{s.date ? new Date(s.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : ''}</Text>
                        </View>
                      ))}
                      <Text style={styles.soldFootnote}>* New build   ·   Source: HM Land Registry</Text>
                    </View>
                  )}
                  {soldPrices && soldPrices.length > 0 && (() => {
                    const byYear: Record<number, number[]> = {};
                    for (const s of soldPrices) {
                      const yr = s.date ? new Date(s.date).getFullYear() : 0;
                      if (yr > 2000) { (byYear[yr] = byYear[yr] ?? []).push(s.price); }
                    }
                    const rows = Object.entries(byYear)
                      .map(([yr, prices]) => {
                        const sorted = [...prices].sort((a, b) => a - b);
                        const mid = Math.floor(sorted.length / 2);
                        const median = sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
                        return { year: Number(yr), median, count: prices.length };
                      })
                      .sort((a, b) => a.year - b.year);
                    if (rows.length < 2) return null;
                    return (
                      <View style={{ marginTop: spacing.md }}>
                        <Text style={[styles.soldHeaderText, { marginBottom: spacing.xs }]}>Price Trend by Year</Text>
                        <View style={[styles.soldTableHeader, { flexDirection: 'row' }]}>
                          <Text style={[styles.soldHeaderText, { flex: 1 }]}>Year</Text>
                          <Text style={[styles.soldHeaderText, { flex: 1.5, textAlign: 'right' }]}>Local median</Text>
                          <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>YoY</Text>
                          <Text style={[styles.soldHeaderText, { flex: 1.5, textAlign: 'right' }]}>UK avg</Text>
                        </View>
                        {rows.map((row, i) => {
                          const prev = rows[i - 1];
                          const yoy = prev ? ((row.median - prev.median) / prev.median) * 100 : null;
                          const ukAvg = UK_HPI[row.year] ?? null;
                          const yoyColor = yoy == null ? colors.textMuted : yoy >= 0 ? '#22c55e' : '#ef4444';
                          return (
                            <View key={row.year} style={[styles.soldTableRow, i % 2 === 1 && styles.soldTableRowAlt, { flexDirection: 'row', alignItems: 'center' }]}>
                              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>{row.year} ({row.count})</Text>
                              <Text style={{ flex: 1.5, fontSize: font.sizes.sm, color: colors.accent, textAlign: 'right', fontWeight: '700' }}>£{row.median.toLocaleString('en-GB')}</Text>
                              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: yoyColor, textAlign: 'right', fontWeight: '700' }}>
                                {yoy != null ? `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%` : '—'}
                              </Text>
                              <Text style={{ flex: 1.5, fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'right' }}>
                                {ukAvg ? `£${(ukAvg / 1000).toFixed(0)}k` : '—'}
                              </Text>
                            </View>
                          );
                        })}
                        <Text style={styles.soldFootnote}>Local = median of sales in this postcode. UK avg = England & Wales national average (Land Registry). YoY = year-on-year change.</Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}

            {/* Flood Risk sub-tab */}
            {ddTab === 'flood' && (
              <View style={styles.card}>
                {!floodRisk && !floodLoading && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up flood risk.</Text>}
                {floodLoading && !floodRisk && <Text style={styles.soldNone}>Looking up flood risk…</Text>}
                {floodRisk && (
                  <>
                    <View style={styles.floodLevelRow}>
                      <Text style={styles.floodLevelIcon}>
                        {floodRisk.level === 'low' ? '🟢' : floodRisk.level === 'medium' ? '🟡' : '🔴'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.floodLevelLabel}>{floodRisk.zoneLabel} — {floodRisk.postcode}</Text>
                        <Text style={styles.floodLevelSub}>Annual: {floodRisk.annualProbability} · 5-year: {floodRisk.fiveYearProbability}</Text>
                        {floodRisk.floodTypes.length > 0 && (
                          <Text style={styles.floodLevelSub}>{floodRisk.floodTypes.join(', ')}</Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.floodDisclaimer}>Source: EA Flood Zones via Planning Data (official UK planning classification). Not a substitute for a full flood risk assessment.</Text>
                  </>
                )}
              </View>
            )}

            {/* Planning sub-tab */}
            {ddTab === 'planning' && (
              <View>
                <View style={styles.card}>
                  {planningError && <Text style={styles.soldError}>{planningError}</Text>}
                  {!planningData && !planningLoading && !planningError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up planning applications.</Text>}
                  {planningLoading && <Text style={styles.soldNone}>Looking up planning applications…</Text>}
                  {planningNote && <Text style={styles.planningNote}>{planningNote}</Text>}
                  {planningData && planningData.length === 0 && !planningNote && (
                    <Text style={styles.soldNone}>No planning applications found within 500m in the last 3 years.</Text>
                  )}
                  {planningData && planningData.length > 0 && (
                    <View style={styles.planningList}>
                      {planningCouncil ? <Text style={[styles.planningDate, { marginBottom: 8, color: colors.textMuted }]}>Council: {planningCouncil} · {planningData.length} applications within 500m (last 3 yrs)</Text> : null}
                      {planningData.map((app, i) => {
                        const statusLower = (app.status || '').toLowerCase();
                        const statusColor = statusLower === 'permitted' || statusLower === 'conditions'
                          ? colors.positive
                          : statusLower === 'rejected'
                          ? colors.negative
                          : '#f59e0b';
                        return (
                          <View key={i} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt]}>
                            <View style={styles.planningRowTop}>
                              <Text style={styles.planningRef} numberOfLines={1}>{app.type || app.reference || '—'}</Text>
                              {app.status ? (
                                <Text style={[styles.planningDecision, { color: statusColor }]}>{app.status}</Text>
                              ) : null}
                            </View>
                            {app.address ? <Text style={styles.planningAddress} numberOfLines={2}>{app.address}</Text> : null}
                            {app.description ? <Text style={styles.planningDesc} numberOfLines={3}>{app.description}</Text> : null}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                              {app.date ? <Text style={styles.planningDate}>{new Date(app.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text> : null}
                              {app.distanceM != null ? <Text style={styles.planningDate}>{app.distanceM}m away</Text> : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.floodDisclaimer}>Source: planit.org.uk — aggregated from council planning portals. Check your local authority portal for full history.</Text>
                </View>
              </View>
            )}

            {/* EPC sub-tab */}
            {ddTab === 'epc' && (
              <View>
                <View style={styles.card}>
                  {epcError && <Text style={styles.soldError}>{epcError}</Text>}
                  {!epcData && !epcLoading && !epcError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up EPC ratings.</Text>}
                  {epcLoading && <Text style={styles.soldNone}>Looking up EPC certificates…</Text>}
                  {epcData && epcData.length === 0 && (
                    <Text style={styles.soldNone}>No EPC certificates found for this postcode.</Text>
                  )}
                  {epcData && epcData.length > 0 && (
                    <View style={styles.soldTable}>
                      <View style={styles.soldTableHeader}>
                        <Text style={[{ flex: 3 }, styles.soldHeaderText]}>Address</Text>
                        <Text style={[{ flex: 1, textAlign: 'center' }, styles.soldHeaderText]}>Rating</Text>
                        <Text style={[{ flex: 1, textAlign: 'center' }, styles.soldHeaderText]}>Size</Text>
                        <Text style={[{ flex: 2, textAlign: 'right' }, styles.soldHeaderText]}>Valid Until</Text>
                      </View>
                      {epcData.map((e, i) => {
                        const ratingColor = e.rating === 'A' || e.rating === 'B' ? '#22c55e'
                          : e.rating === 'C' ? '#84cc16'
                          : e.rating === 'D' ? '#f59e0b'
                          : e.rating === 'E' ? '#f97316'
                          : '#ef4444';
                        const sizeLabel = e.floorArea ? e.floorArea.replace(' square metres', 'm²') : '—';
                        return (
                          <View key={i} style={[styles.soldTableRow, i % 2 === 1 && styles.soldTableRowAlt]}>
                            <Text style={{ flex: 3, fontSize: 11, color: colors.text }} numberOfLines={2}>{e.address}</Text>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                              <View style={{ backgroundColor: ratingColor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{e.rating}</Text>
                              </View>
                            </View>
                            <Text style={{ flex: 1, fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>{sizeLabel}</Text>
                            <View style={{ flex: 2, alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 11, color: e.expired ? colors.negative : colors.textMuted, textAlign: 'right' }} numberOfLines={2}>
                                {e.validUntil}{e.expired ? '\nExpired' : ''}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                      <Text style={styles.soldFootnote}>Source: GOV.UK Find an Energy Certificate</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Crime sub-tab */}
            {ddTab === 'crime' && (
              <View>
                <View style={styles.card}>
                  {crimeError && <Text style={styles.soldError}>{crimeError}</Text>}
                  {!crimeData && !crimeLoading && !crimeError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up local crime data.</Text>}
                  {crimeLoading && <Text style={styles.soldNone}>Looking up crime data…</Text>}
                  {crimeData?.note && <Text style={styles.planningNote}>{crimeData.note}</Text>}
                  {crimeData && !crimeData.note && (
                    <View>
                      <View style={[styles.floodLevelRow]}>
                        <Text style={styles.floodLevelIcon}>
                          {crimeData.colour === 'low' ? '🟢' : crimeData.colour === 'medium' ? '🟡' : '🔴'}
                        </Text>
                        <View>
                          <Text style={styles.floodLevelLabel}>{crimeData.level} Crime Area</Text>
                          <Text style={styles.floodLevelSub}>{crimeData.avgPerMonth} crimes/month avg · {crimeData.monthsAnalysed} months of data</Text>
                        </View>
                      </View>
                      <View style={{ marginTop: 8 }}>
                        {crimeData.breakdown.map((b, i) => (
                          <View key={i} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                            <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1 }}>{b.label}</Text>
                            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, fontWeight: '600' }}>{b.perMonth}/mo</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={styles.floodDisclaimer}>Source: data.police.uk (UK street-level crime). Crimes are averaged over the last 7 months at the nearest reporting location.</Text>
                </View>
              </View>
            )}

            {/* Transport sub-tab */}
            {ddTab === 'transport' && (
              <View>
                <View style={styles.card}>
                  {transportError && <Text style={styles.soldError}>{transportError}</Text>}
                  {!transportData && !transportLoading && !transportError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up nearby stations.</Text>}
                  {transportLoading && <Text style={styles.soldNone}>Looking up transport links…</Text>}
                  {transportData?.note && <Text style={styles.planningNote}>{transportData.note}</Text>}
                  {transportData && transportData.stops.length > 0 && (
                    <View>
                      {transportData.stops.map((s, i) => {
                        const typeColor = s.type === 'Tube/Metro' ? '#0019a8'
                          : s.type === 'Tram' ? '#748f20'
                          : s.type === 'Bus' ? '#e1251b'
                          : '#1c3c78';
                        return (
                          <View key={i} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                            <View style={{ backgroundColor: typeColor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 52, alignItems: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{s.type}</Text>
                            </View>
                            <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>{s.name}</Text>
                            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>{s.distanceKm}km · {s.walkMins}min</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.floodDisclaimer}>Source: OpenStreetMap via Overpass API. Shows stations, tram stops and bus stations within 2km. Walk times are estimates.</Text>
                </View>
              </View>
            )}

            {/* Rental Benchmarks sub-tab */}
            {ddTab === 'rental' && (
              <View>
                <View style={styles.card}>
                  {rentalError && <Text style={styles.soldError}>{rentalError}</Text>}
                  {!rentalData && !rentalLoading && !rentalError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up rental benchmarks.</Text>}
                  {rentalLoading && <Text style={styles.soldNone}>Looking up rental rates…</Text>}
                  {rentalData && (
                    <View>
                      {/* Header info */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                        {rentalData.brmaName && (
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>BRMA: {rentalData.brmaName}</Text>
                        )}
                        {rentalData.onsMedians?.area && (
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Council: {rentalData.onsMedians.area}</Text>
                        )}
                      </View>
                      {/* Column headers */}
                      {rentalData.lha && (
                      <View style={[styles.soldTableHeader, { flexDirection: 'row', paddingBottom: 6, marginBottom: 4 }]}>
                        <Text style={[styles.soldHeaderText, { flex: 1.8 }]}>Bedrooms</Text>
                        <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>LHA</Text>
                        <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>Median</Text>
                        <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>75th Percentile</Text>
                      </View>
                      )}
                      {rentalData.lha && Object.entries(rentalData.lha).map(([key, rate], i) => {
                        const ons = rentalData.onsMedians?.rents?.[key];
                        return (
                          <View key={key} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt, { flexDirection: 'row', alignItems: 'center' }]}>
                            <Text style={{ flex: 1.8, fontSize: font.sizes.sm, color: colors.text }}>{rate.label}</Text>
                            <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'right' }}>
                              {rate.monthlyRate != null ? `£${rate.monthlyRate.toFixed(0)}` : '—'}
                            </Text>
                            <Text style={{ flex: 1, fontSize: font.sizes.sm, color: ons?.median != null ? colors.accent : colors.textMuted, textAlign: 'right', fontWeight: ons?.median != null ? '700' : '400' }}>
                              {ons?.median != null ? `£${ons.median}` : '—'}
                            </Text>
                            <Text style={{ flex: 1, fontSize: font.sizes.sm, color: ons?.uq != null ? colors.text : colors.textMuted, textAlign: 'right' }}>
                              {ons?.uq != null ? `£${ons.uq}` : '—'}
                            </Text>
                          </View>
                        );
                      })}
                      {!rentalData.onsMedians && (
                        <Text style={[styles.planningNote, { marginTop: spacing.sm }]}>Market median not available for this area (ONS data suppressed for small samples).</Text>
                      )}
                    </View>
                  )}
                  <Text style={styles.floodDisclaimer}>LHA = 30th pct (VOA, live). Median = 50th pct. 75th Percentile = upper quartile. ONS PRMS Oct 2022–Sep 2023 — current rents likely higher. All monthly.</Text>
                </View>
              </View>
            )}

            {/* HMO / Article 4 sub-tab */}
            {ddTab === 'hmo' && (
              <View>
                <View style={styles.card}>
                  {hmoError && <Text style={styles.soldError}>{hmoError}</Text>}
                  {!hmoData && !hmoLoading && !hmoError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to check Article 4 Direction status.</Text>}
                  {hmoLoading && <Text style={styles.soldNone}>Checking Article 4 Direction areas…</Text>}
                  {hmoData && (
                    <View>
                      <View style={[styles.floodLevelRow, { marginBottom: spacing.sm }]}>
                        <Text style={styles.floodLevelIcon}>{hmoData.isArticle4 ? '🔴' : '🟢'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.floodLevelLabel}>
                            {hmoData.isArticle4 ? 'Article 4 Direction in effect' : 'No Article 4 Direction found'}
                          </Text>
                          {hmoData.council && <Text style={styles.floodLevelSub}>Council: {hmoData.council}</Text>}
                        </View>
                      </View>
                      {hmoData.isArticle4 && hmoData.areas.length > 0 && (
                        <View style={{ marginBottom: spacing.sm }}>
                          {hmoData.areas.map((a, i) => (
                            <View key={i} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt]}>
                              <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: '600' }}>{a.name}</Text>
                              {a.startDate ? <Text style={styles.planningDate}>In force since {a.startDate}</Text> : null}
                            </View>
                          ))}
                        </View>
                      )}
                      {hmoData.isArticle4 ? (
                        <Text style={styles.planningNote}>
                          ⚠️ Article 4 Direction removes Permitted Development Rights in this area. Converting a C3 dwelling to a C4 HMO (3–6 occupants) requires full planning permission. Check with {hmoData.council ?? 'the local authority'} before purchasing.
                        </Text>
                      ) : (
                        <Text style={styles.planningNote}>
                          ✓ No Article 4 Direction detected at this postcode. Standard Permitted Development Rights apply — small HMOs (C4, 3–6 occupants) may not require planning permission, but always verify with the local authority.
                        </Text>
                      )}
                      {hmoData.council && (
                        <Text style={[styles.floodDisclaimer, { marginTop: spacing.xs }]}>
                          Search HMO licensing for {hmoData.council} at your local authority website or gov.uk.
                        </Text>
                      )}
                    </View>
                  )}
                  <Text style={styles.floodDisclaimer}>Source: planning.data.gov.uk Article 4 Direction Areas dataset. For HMO licensing, contact the local authority directly.</Text>
                </View>
              </View>
            )}

            {/* Schools sub-tab */}
            {ddTab === 'schools' && (
              <View>
                <View style={styles.card}>
                  {schoolsError && <Text style={styles.soldError}>{schoolsError}</Text>}
                  {!schoolsData && !schoolsLoading && !schoolsError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to find nearby schools.</Text>}
                  {schoolsLoading && <Text style={styles.soldNone}>Finding nearby schools…</Text>}
                  {schoolsData && schoolsData.length === 0 && (
                    <Text style={styles.soldNone}>No schools found within 2km of this postcode.</Text>
                  )}
                  {schoolsData && schoolsData.length > 0 && (
                    <View>
                      {schoolsData.map((s, i) => {
                        const typeColor = s.type === 'Secondary' ? '#3b82f6' : s.type === 'Primary' ? '#22c55e' : '#8b5cf6';
                        const isSubRating = s.ofstedFormat === 'sub-ratings';
                        const isNotInspected = s.ofstedFormat === 'none';
                        const rating = s.ofstedRating ?? 'Not inspected';
                        const ofstedColor = rating === 'Outstanding' ? '#22c55e'
                          : rating === 'Good' ? '#3b82f6'
                          : rating === 'Requires Improvement' ? '#f59e0b'
                          : rating === 'Inadequate' ? '#ef4444'
                          : '#6b7280';
                        return (
                          <View key={i} style={[styles.soldTableRow, i % 2 === 1 && styles.soldTableRowAlt, { paddingVertical: 8, flexDirection: 'column', width: '100%' }]}>
                            <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: '600', marginBottom: 6, flexShrink: 1 }} numberOfLines={3}>{s.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <View style={{ backgroundColor: typeColor, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{s.type}</Text>
                              </View>
                              {!isSubRating && (
                                <View style={{ backgroundColor: ofstedColor, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{rating}</Text>
                                </View>
                              )}
                              {s.reportUrl && (
                                <TouchableOpacity onPress={() => Linking.openURL(s.reportUrl!)}>
                                  <Text style={{ fontSize: 10, color: '#3b82f6', textDecorationLine: 'underline' }}>View Ofsted report →</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            {s.distanceKm !== null && (
                              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>{s.distanceKm}km away</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.floodDisclaimer}>Source: Ofsted (reports.ofsted.gov.uk). Schools within 2km, sorted by distance. Post-Sep 2024 schools link directly to report — Ofsted no longer gives overall grades for state schools.</Text>
                </View>
              </View>
            )}

            {/* Ground Risk sub-tab */}
            {ddTab === 'groundrisk' && (
              <View>
                <View style={styles.card}>
                  {groundRiskError && <Text style={styles.soldError}>{groundRiskError}</Text>}
                  {!groundRiskData && !groundRiskLoading && !groundRiskError && (
                    <Text style={styles.soldNone}>Enter a postcode above and tap Search to check ground risk.</Text>
                  )}
                  {groundRiskLoading && <Text style={styles.soldNone}>Checking coal and ground risk data…</Text>}
                  {groundRiskData && (() => {
                    const { coal, hazards } = groundRiskData;
                    const isRedAlert = coal.highRisk || coal.surfaceMining;
                    const isAmber = coal.coalResource || coal.reportingArea || hazards.landslideFound;
                    const ragBg = isRedAlert ? '#ef4444' : isAmber ? '#f59e0b' : '#22c55e';
                    const ragLabel = isRedAlert ? 'HIGH RISK' : isAmber ? 'MODERATE RISK' : 'LOW RISK';
                    const ragSub = isRedAlert
                      ? 'Coal mining high-risk area or surface mining present — specialist survey essential before purchase.'
                      : isAmber
                      ? 'Coal resource area, reporting area, or ground hazard noted — check coal authority and specialist report.'
                      : 'No significant coal or ground risk identified at this postcode.';
                    return (
                      <View>
                        <View style={{ backgroundColor: ragBg, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.sizes.md }}>{ragLabel}</Text>
                          <Text style={{ color: '#fff', fontSize: font.sizes.sm, textAlign: 'center', marginTop: 4 }}>{ragSub}</Text>
                        </View>
                        <Text style={{ fontSize: font.sizes.sm, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Coal Mining Risk (Coal Authority)</Text>
                        {[
                          { label: 'Development High Risk Area', value: coal.highRisk, severe: true },
                          { label: 'Surface Mining (Past/Current)', value: coal.surfaceMining, severe: true },
                          { label: 'Coal Resource Area', value: coal.coalResource, severe: false },
                          { label: 'Coal Mining Reporting Area', value: coal.reportingArea, severe: false },
                        ].map((row, i) => (
                          <View key={row.label} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt, { flexDirection: 'row', alignItems: 'center' }]}>
                            <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>{row.label}</Text>
                            <View style={{ backgroundColor: row.value ? (row.severe ? '#ef4444' : '#f59e0b') : '#22c55e', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{row.value ? 'YES' : 'NO'}</Text>
                            </View>
                          </View>
                        ))}
                        <SectionDivider title="Ground Hazards (BGS)" />

                        <View style={[styles.planningRow, { flexDirection: 'row', alignItems: 'center' }]}>
                          <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>Landslide (BGS record)</Text>
                          <View style={{ backgroundColor: hazards.landslideFound ? '#ef4444' : '#22c55e', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{hazards.landslideFound ? 'RECORDED' : 'NONE'}</Text>
                          </View>
                        </View>
                        <View style={[styles.planningRow, styles.planningRowAlt, { flexDirection: 'row', alignItems: 'center' }]}>
                          <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>Superficial Geology</Text>
                          <Text style={{ fontSize: font.sizes.sm, color: colors.accent, fontWeight: '600' }}>{hazards.surfaceGeology ?? 'No data'}</Text>
                        </View>
                        <Text style={[styles.floodDisclaimer, { marginTop: spacing.sm }]}>
                          For shrink-swell clays, dissolution (sinkholes), and compressible ground ratings, commission a GeoSure report from BGS (~£30–60) or a full Groundsure report (~£50–120). Coal Authority interactive map: mapapps2.bgs.ac.uk/coalauthority
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}

            {/* Employment sub-tab */}
            {ddTab === 'employment' && (
              <View>
                <View style={styles.card}>
                  {!rentalData && !rentalLoading && !rentalError && <Text style={styles.soldNone}>Enter a postcode above and tap Search to look up employment data.</Text>}
                  {rentalLoading && <Text style={styles.soldNone}>Looking up employment data…</Text>}
                  {rentalError && <Text style={styles.soldError}>{rentalError}</Text>}
                  {rentalData && !rentalData.employment && (
                    <Text style={styles.soldNone}>Employment data not available for this area.</Text>
                  )}
                  {rentalData?.employment && (() => {
                    const emp = rentalData.employment!;
                    const uk = emp.ukAverage;
                    const rows = [
                      { label: 'Employment rate', local: emp.employmentRate, uk: uk?.employmentRate ?? null, higherIsBetter: true },
                      { label: 'Unemployment rate', local: emp.unemploymentRate, uk: uk?.unemploymentRate ?? null, higherIsBetter: false },
                      { label: 'Economic inactivity', local: emp.inactivityRate, uk: uk?.inactivityRate ?? null, higherIsBetter: false },
                    ];
                    return (
                      <View>
                        <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
                          Labour market — {emp.area ?? 'Local Authority'} vs UK (ages 16–64, ONS APS)
                        </Text>
                        <View style={[styles.soldTableHeader, { flexDirection: 'row', paddingBottom: 6, marginBottom: 4 }]}>
                          <Text style={[styles.soldHeaderText, { flex: 2 }]}>Indicator</Text>
                          <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>Local</Text>
                          <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>UK avg</Text>
                          <Text style={[styles.soldHeaderText, { flex: 1, textAlign: 'right' }]}>vs UK</Text>
                        </View>
                        {rows.map((row, i) => {
                          const diff = row.local != null && row.uk != null ? row.local - row.uk : null;
                          const better = diff != null ? (row.higherIsBetter ? diff > 0 : diff < 0) : null;
                          const diffColor = better === true ? '#22c55e' : better === false ? '#ef4444' : colors.textMuted;
                          const diffStr = diff != null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—';
                          return (
                            <View key={row.label} style={[styles.planningRow, i % 2 === 1 && styles.planningRowAlt, { flexDirection: 'row', alignItems: 'center' }]}>
                              <Text style={{ flex: 2, fontSize: font.sizes.sm, color: colors.text }}>{row.label}</Text>
                              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.accent, textAlign: 'right', fontWeight: '700' }}>
                                {row.local != null ? `${row.local.toFixed(1)}%` : '—'}
                              </Text>
                              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'right' }}>
                                {row.uk != null ? `${row.uk.toFixed(1)}%` : '—'}
                              </Text>
                              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: diffColor, textAlign: 'right', fontWeight: '700' }}>
                                {diffStr}
                              </Text>
                            </View>
                          );
                        })}
                        <Text style={[styles.floodDisclaimer, { marginTop: spacing.sm }]}>vs UK = difference vs UK average. Green = stronger than UK. Red = weaker. Higher employment and lower unemployment/inactivity signal stronger rental demand.</Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── GUIDE VIEW ── */}
        {view === 'guide' && (
          <View>
            <View style={styles.guideSection}>
              <Text style={styles.guideHeading}>SDLT — Additional Dwelling (2025)</Text>
              <Text style={styles.guideBody}>5% surcharge applies to all investment properties on top of standard rates:</Text>
              <View style={styles.guidePill}><Text style={styles.guidePillLabel}>£0–£250k</Text><Text style={styles.guidePillVal}>5%</Text></View>
              <View style={styles.guidePill}><Text style={styles.guidePillLabel}>£250k–£925k</Text><Text style={styles.guidePillVal}>10%</Text></View>
              <View style={styles.guidePill}><Text style={styles.guidePillLabel}>£925k–£1.5m</Text><Text style={styles.guidePillVal}>15%</Text></View>
              <View style={styles.guidePill}><Text style={styles.guidePillLabel}>Over £1.5m</Text><Text style={styles.guidePillVal}>17%</Text></View>
            </View>
            <View style={styles.guideSection}>
              <Text style={styles.guideHeading}>HMO Licensing</Text>
              <Text style={styles.guideBody}>Mandatory licence required if 5+ tenants from 2+ households share facilities. Many councils extend this to 3–4 tenants. Apply to your local authority — fees typically £500–£2,000, valid 5 years. Fire safety, adequate room sizes (&gt;6.51m²), and kitchen/bathroom ratios are enforced.</Text>
            </View>
            <View style={styles.guideSection}>
              <Text style={styles.guideHeading}>Section 24 (Personal Ownership)</Text>
              <Text style={styles.guideBody}>Since 2020, individual landlords cannot deduct mortgage interest from rental income before calculating tax. Instead you get a 20% tax credit on interest. Higher/additional rate taxpayers pay more effective tax. Ltd Co ownership avoids this — interest remains a deductible expense against corporation tax (25%).</Text>
            </View>
            <View style={styles.guideSection}>
              <Text style={styles.guideHeading}>HMO Mortgage Notes</Text>
              <Text style={styles.guideBody}>HMO mortgages are specialist products — fewer lenders, higher rates (typically +0.5–1% vs standard BTL), and stricter criteria. Common LTV cap is 75%. Some lenders require minimum 5 years' experience. Factor in a higher rate in the Finance section when analysing HMO deals.</Text>
            </View>
            <View style={styles.guideSection}>
              <Text style={styles.guideHeading}>BRR (Refinance After Refurb)</Text>
              <Text style={styles.guideBody}>Buy-Refurb-Refinance: buy below market with bridging/cash, refurb to add value, refinance at new (higher) value to pull capital back out. Goal: get all or most of your money back while keeping the asset. Enable "Refinance after refurb? Yes" in the Finance section to model this.</Text>
            </View>
            <View style={styles.guideSection}>
              <Text style={styles.guideHeading}>STL Rules (Short-Term Let)</Text>
              <Text style={styles.guideBody}>In England, short-term lets (AirBnB) of entire homes now require planning permission if letting &gt;90 nights/year (from 2024 in some LPAs). Check local council rules. In London, the 90-day rule limits whole-property STLs. Scotland requires a licence. Higher returns but higher ongoing costs and management overhead.</Text>
            </View>
          </View>
        )}

        {/* ── SAVED DEALS VIEW ── */}
        {view === 'saved' && (
          <View>
            {savedDeals.length === 0 ? (
              <View style={styles.emptyResults}>
                <Text style={styles.emptyText}>No saved deals yet</Text>
                <Text style={[styles.emptyText, { fontSize: font.sizes.xs, marginTop: 4 }]}>Tap "Save Deal" in the Calculator to compare deals here</Text>
              </View>
            ) : (
              <>
                <View style={[styles.sectionHeaderRow, { marginBottom: spacing.sm }]}>
                  <Text style={styles.sectionTitle}>{savedDeals.length} deal{savedDeals.length !== 1 ? 's' : ''} saved</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.csvBtn} onPress={exportCSV}>
                      <Text style={styles.csvBtnText}>Export CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSavedDeals([])}>
                      <Text style={styles.clearAll}>Clear all</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {savedDeals.length >= 2 && (
                  <View style={styles.compareSection}>
                    <Text style={[styles.compareTitle, { marginBottom: spacing.sm }]}>Quick Compare</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compareScroll}>
                      {savedDeals.map(deal => {
                        const dc = STRATEGIES.find(s => s.key === deal.strategy)?.color ?? colors.primary;
                        return (
                          <View key={deal.id} style={[styles.dealCard, { borderColor: dc, borderWidth: 1 }]}>
                            <View style={styles.dealCardHeader}>
                              <Text style={[styles.dealCardStrategy, { color: dc }]}>{deal.strategy.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.dealCardAddress} numberOfLines={2}>{deal.label}</Text>
                            <View style={styles.dealCardDivider} />
                            <View style={styles.dealCardRow}>
                              <Text style={styles.dealCardKey}>Cashflow</Text>
                              <Text style={[styles.dealCardVal, { color: deal.monthlyNetCashflow >= 0 ? colors.positive : colors.negative, fontSize: font.sizes.sm }]}>{fmtGbp(deal.monthlyNetCashflow)}/mo</Text>
                            </View>
                            <View style={styles.dealCardRow}>
                              <Text style={styles.dealCardKey}>CoC return</Text>
                              <Text style={[styles.dealCardVal, { color: deal.cashOnCash >= 0 ? colors.positive : colors.negative, fontSize: font.sizes.sm }]}>{fmtPct(deal.cashOnCash)}</Text>
                            </View>
                            <View style={styles.dealCardRow}>
                              <Text style={styles.dealCardKey}>Net yield</Text>
                              <Text style={[styles.dealCardVal, { fontSize: font.sizes.sm }]}>{fmtPct(deal.netYield)}</Text>
                            </View>
                            <View style={styles.dealCardRow}>
                              <Text style={styles.dealCardKey}>Invested</Text>
                              <Text style={[styles.dealCardVal, { fontSize: font.sizes.sm }]}>{fmtGbp(deal.totalInvested)}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.savedGrid}>
                  {savedDeals.map(deal => {
                    const dealColor = STRATEGIES.find(s => s.key === deal.strategy)?.color ?? colors.primary;
                    return (
                      <View key={deal.id} style={[styles.savedCard, { borderColor: dealColor }]}>
                        <View style={styles.dealCardHeader}>
                          <View style={[styles.stratBadge, { backgroundColor: dealColor + '22' }]}>
                            <Text style={[styles.stratBadgeText, { color: dealColor }]}>{deal.strategy.toUpperCase()}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setSavedDeals(prev => prev.filter(d => d.id !== deal.id))}>
                            <Text style={styles.dealCardRemove}>✕</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.savedCardAddress} numberOfLines={2}>{deal.label}</Text>
                        <View style={styles.savedCardDivider} />
                        <View style={styles.dealCardRow}>
                          <Text style={styles.dealCardKey}>Upfront capital</Text>
                          <Text style={styles.dealCardVal}>{fmtGbp(deal.totalInvested)}</Text>
                        </View>
                        <View style={styles.dealCardRow}>
                          <Text style={styles.dealCardKey}>Cash left in</Text>
                          <Text style={styles.dealCardVal}>{fmtGbp(deal.capitalLeftIn ?? deal.totalInvested)}</Text>
                        </View>
                        <View style={styles.dealCardRow}>
                          <Text style={styles.dealCardKey}>Return on capital</Text>
                          <Text style={[styles.dealCardVal, { color: deal.cashOnCash >= 0 ? colors.positive : colors.negative }]}>{fmtPct(deal.cashOnCash)}</Text>
                        </View>
                        <View style={styles.dealCardRow}>
                          <Text style={styles.dealCardKey}>Cashflow</Text>
                          <Text style={[styles.dealCardVal, { color: deal.monthlyNetCashflow >= 0 ? colors.positive : colors.negative }]}>{fmtGbp(deal.monthlyNetCashflow)}/mo</Text>
                        </View>
                        {deal.fiveYearTotalReturn != null && (
                          <View style={styles.dealCardRow}>
                            <Text style={styles.dealCardKey}>5yr total return</Text>
                            <Text style={[styles.dealCardVal, { color: deal.fiveYearTotalReturn >= 0 ? colors.positive : colors.negative }]}>{fmtGbp(deal.fiveYearTotalReturn)}</Text>
                          </View>
                        )}
                        {deal.floodRiskLevel != null && (
                          <View style={styles.dealCardRow}>
                            <Text style={styles.dealCardKey}>Flood risk</Text>
                            <Text style={[styles.dealCardVal, { color: deal.floodRiskLevel === 'low' ? colors.positive : deal.floodRiskLevel === 'medium' ? '#f59e0b' : colors.negative }]}>
                              {deal.floodRiskLevel === 'low' ? '🟢 Low' : deal.floodRiskLevel === 'medium' ? '🟡 Medium' : '🔴 High'}
                            </Text>
                          </View>
                        )}
                        <View style={styles.savedCardActions}>
                          <TouchableOpacity style={[styles.savedCardBtn, { borderColor: dealColor }]} onPress={() => loadDealForEdit(deal)}>
                            <Text style={[styles.savedCardBtnText, { color: dealColor }]}>✎ Update</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.savedCardBtn, { borderColor: dealColor }]} onPress={() => shareDealReport(deal)}>
                            <Text style={[styles.savedCardBtnText, { color: dealColor }]}>⬆ Share</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {/* ── CALCULATOR VIEW ── */}
        {view === 'calculator' && <>

        {/* Strategy tabs */}
        <View style={styles.tabs}>
          {STRATEGIES.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.tab, inputs.strategy === s.key && { backgroundColor: s.color + '22', borderColor: s.color }]}
              onPress={() => setInputs(prev => ({ ...prev, strategy: s.key }))}
            >
              <Text style={[styles.tabText, inputs.strategy === s.key && { color: s.color }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Property Details */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Property Details</Text>
            <TouchableOpacity
              style={styles.floodBadge}
              onPress={() => { const pc = formatPostcode(inputs.postcode); if (isValidPostcode(pc)) { setDdPostcode(pc); setSoldPostcode(pc); setView('duediligence'); } }}
              disabled={!floodRisk && !floodLoading}
            >
              {floodLoading ? (
                <Text style={styles.floodBadgeText}>⏳</Text>
              ) : floodRisk ? (
                <Text style={styles.floodBadgeText}>
                  {floodRisk.level === 'low' ? '🟢' : floodRisk.level === 'medium' ? '🟡' : '🔴'}
                </Text>
              ) : (
                <Text style={[styles.floodBadgeText, { color: colors.textMuted }]}>💧</Text>
              )}
              <Text style={styles.floodBadgeLabel}>Flood</Text>
            </TouchableOpacity>
          </View>
          {/* House number + postcode row */}
          <View style={styles.postcodeRow}>
            <View style={{ width: '60%', paddingRight: spacing.sm }}>
              <InputField label="House No. / Name" value={inputs.houseNumber} onChangeText={set('houseNumber')} placeholder="e.g. 12" keyboardType="default" />
            </View>
            <View style={{ width: '40%' }}>
              <InputField label="Postcode" value={inputs.postcode} onChangeText={v => { set('postcode')(v); }} placeholder="SW1A 2AA" keyboardType="default" />
            </View>
          </View>
          <InputField label="Listing URL" value={inputs.url} onChangeText={set('url')} placeholder="e.g. rightmove.co.uk/..." keyboardType="url" />

          {/* Further Details toggle */}
          <View style={[styles.toggleRow, { marginBottom: spacing.xs }]}>
            <Text style={styles.label}>Further Details</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity style={[styles.segBtn, inputs.furtherDetails === 'yes' && styles.segBtnActive]} onPress={() => setInputs(prev => ({ ...prev, furtherDetails: 'yes' }))}>
                <Text style={[styles.segBtnText, inputs.furtherDetails === 'yes' && styles.segBtnTextActive]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, inputs.furtherDetails === 'no' && styles.segBtnActive]} onPress={() => setInputs(prev => ({ ...prev, furtherDetails: 'no' }))}>
                <Text style={[styles.segBtnText, inputs.furtherDetails === 'no' && styles.segBtnTextActive]}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
          {inputs.furtherDetails === 'yes' && (
            <View style={styles.subCard}>
              <InputField label="EPC Rating" value={inputs.epcRating} onChangeText={set('epcRating')} placeholder="e.g. D" keyboardType="default" />
              <InputField label="Floor Space" value={inputs.floorSpace} onChangeText={set('floorSpace')} placeholder="e.g. 85" suffix="m²" />
              <InputField label="Bedrooms" value={inputs.bedrooms} onChangeText={set('bedrooms')} placeholder="e.g. 3" />
              <InputField label="Bathrooms" value={inputs.bathrooms} onChangeText={set('bathrooms')} placeholder="e.g. 1" />
              <InputField label="Other Rooms" value={inputs.otherRooms} onChangeText={set('otherRooms')} placeholder="e.g. 2" />
            </View>
          )}
        </View>

        {/* Ownership toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.label}>Ownership Structure</Text>
              <Text style={styles.hint}>Affects Section 24 tax treatment</Text>
            </View>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segBtn, inputs.ownership === 'personal' && styles.segBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, ownership: 'personal' }))}
              >
                <Text style={[styles.segBtnText, inputs.ownership === 'personal' && styles.segBtnTextActive]}>Personal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segBtn, inputs.ownership === 'company' && styles.segBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, ownership: 'company' }))}
              >
                <Text style={[styles.segBtnText, inputs.ownership === 'company' && styles.segBtnTextActive]}>Ltd Co</Text>
              </TouchableOpacity>
            </View>
          </View>
          {inputs.ownership === 'personal' && (
            <Text style={styles.taxNote}>⚠️ Section 24: mortgage interest not fully deductible. Higher-rate taxpayers pay more tax.</Text>
          )}
          {inputs.ownership === 'company' && (
            <Text style={styles.taxNoteGreen}>✓ Ltd Co: mortgage interest deductible as expense. Corporation tax on profits.</Text>
          )}
        </View>

        {/* Purchase */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Purchase Price</Text>
          <InputField label="Offer Price" value={inputs.purchasePrice} onChangeText={set('purchasePrice')} prefix="£" placeholder="e.g. 180000" />
          <InputField label="Estimated Fair Value" value={inputs.estimatedFairValue} onChangeText={set('estimatedFairValue')} prefix="£" placeholder="e.g. 200000" hint="Market value — calculates capital on purchase" />
          <InputField label="Renovated Value (GDV)" value={inputs.renovatedValue} onChangeText={set('renovatedValue')} prefix="£" placeholder="e.g. 250000" hint="Value after refurb — used in 5yr projection" />
        </View>

        {/* Purchase costs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Purchase Costs</Text>
          <InputField label="Solicitor Fees" value={inputs.solicitorFees} onChangeText={set('solicitorFees')} prefix="£" />
          <InputField label="Other Costs" value={inputs.other} onChangeText={set('other')} prefix="£" />
          {results && (
            <TouchableOpacity style={styles.sdltToggle} onPress={() => setShowSdlt(v => !v)}>
              <Text style={styles.sdltLabel}>SDLT (Stamp Duty): {fmtGbp(results.stampDuty)}</Text>
              <Text style={styles.sdltChevron}>{showSdlt ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          )}
          {showSdlt && results && (
            <View style={styles.sdltBreakdown}>
              <Text style={styles.sdltNote}>Additional dwelling surcharge (5%) applied to all bands</Text>
              {results.sdltBreakdown.map(b => (
                <ResultRow key={b.band} label={b.band} value={fmtGbp(b.tax)} indent muted />
              ))}
            </View>
          )}
        </View>

        {/* Refurb */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Refurb</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segBtn, inputs.refurbMode === 'simple' && styles.segBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, refurbMode: 'simple' }))}
              >
                <Text style={[styles.segBtnText, inputs.refurbMode === 'simple' && styles.segBtnTextActive]}>Simple</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segBtn, inputs.refurbMode === 'detailed' && styles.segBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, refurbMode: 'detailed' }))}
              >
                <Text style={[styles.segBtnText, inputs.refurbMode === 'detailed' && styles.segBtnTextActive]}>Detailed</Text>
              </TouchableOpacity>
            </View>
          </View>

          {inputs.refurbMode === 'simple' ? (
            <>
              <InputField label="Refurb Cost" value={inputs.refurbCost} onChangeText={set('refurbCost')} prefix="£" placeholder="0" />
              <InputField label="Contingency" value={inputs.refurbContingencyPct} onChangeText={set('refurbContingencyPct')} suffix="%" placeholder="10" />
            </>
          ) : (
            <>
              <InputField label="Rip Out & Skip" value={inputs.rd_ripOutSkip} onChangeText={set('rd_ripOutSkip')} prefix="£" placeholder="0" />
              <InputField label="Kitchen" value={inputs.rd_kitchen} onChangeText={set('rd_kitchen')} prefix="£" placeholder="0" />
              <InputField label="Electrics" value={inputs.rd_electrics} onChangeText={set('rd_electrics')} prefix="£" placeholder="0" />
              <InputField label="Bathroom" value={inputs.rd_bathroom} onChangeText={set('rd_bathroom')} prefix="£" placeholder="0" />
              <InputField label="Plastering" value={inputs.rd_plastering} onChangeText={set('rd_plastering')} prefix="£" placeholder="0" />
              <InputField label="Internal Doors" value={inputs.rd_internalDoors} onChangeText={set('rd_internalDoors')} prefix="£" placeholder="0" />
              <InputField label="External Doors" value={inputs.rd_externalDoors} onChangeText={set('rd_externalDoors')} prefix="£" placeholder="0" />
              <InputField label="Windows" value={inputs.rd_windows} onChangeText={set('rd_windows')} prefix="£" placeholder="0" />
              <InputField label="Tiling" value={inputs.rd_tiling} onChangeText={set('rd_tiling')} prefix="£" placeholder="0" />
              <InputField label="Carpet & Flooring" value={inputs.rd_carpet} onChangeText={set('rd_carpet')} prefix="£" placeholder="0" />
              <InputField label="Boiler & Heating" value={inputs.rd_boilerHeating} onChangeText={set('rd_boilerHeating')} prefix="£" placeholder="0" />
              <InputField label="Roof" value={inputs.rd_roof} onChangeText={set('rd_roof')} prefix="£" placeholder="0" />
              <InputField label="Damp Proofing" value={inputs.rd_dampProofing} onChangeText={set('rd_dampProofing')} prefix="£" placeholder="0" />
              <CustomItemRows items={customRefurb} onChange={setCustomRefurb} placeholder="Custom item" />
              <InputField label="Contingency" value={inputs.refurbContingencyPct} onChangeText={set('refurbContingencyPct')} suffix="%" placeholder="10" />
              {results?.detailedRefurbTotal != null && (
                <Text style={styles.subtotal}>Subtotal (before contingency): {fmtGbp(results.detailedRefurbTotal)}</Text>
              )}
            </>
          )}
          <InputField label="Holding Costs" value={inputs.holdingCosts} onChangeText={set('holdingCosts')} prefix="£" placeholder="0" hint="Council tax, utilities, insurance during refurb" />
        </View>

        {/* Finance */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Finance</Text>

          {/* Refinance after refurb toggle */}
          <View style={[styles.toggleRow, { marginBottom: spacing.sm }]}>
            <Text style={styles.label}>Refinance after refurb?</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segBtn, inputs.refinanceAfterRefurb === 'yes' && styles.segBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, refinanceAfterRefurb: 'yes' }))}
              >
                <Text style={[styles.segBtnText, inputs.refinanceAfterRefurb === 'yes' && styles.segBtnTextActive]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segBtn, inputs.refinanceAfterRefurb === 'no' && styles.segBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, refinanceAfterRefurb: 'no' }))}
              >
                <Text style={[styles.segBtnText, inputs.refinanceAfterRefurb === 'no' && styles.segBtnTextActive]}>No</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Initial Financing (inline, when refinancing — bridging only) */}
          {inputs.refinanceAfterRefurb === 'yes' && (
            <View style={styles.subCard}>
              <Text style={styles.subSectionTitle}>Bridging Finance</Text>
              <InputField label="Loan Amount" value={inputs.bridgingAmount} onChangeText={set('bridgingAmount')} prefix="£" placeholder={inputs.purchasePrice || 'e.g. 180000'} hint="Defaults to purchase price if blank" />
              <InputField label="Duration (months)" value={inputs.bridgingDurationMonths} onChangeText={set('bridgingDurationMonths')} placeholder="6" />
              <View style={styles.feeRow}>
                <View style={styles.feeInput}>
                  <InputField label="Arrangement Fee" value={inputs.bridgingArrangementFee} onChangeText={set('bridgingArrangementFee')} prefix={inputs.bridgingArrangementFeeMode === 'fixed' ? '£' : undefined} suffix={inputs.bridgingArrangementFeeMode === 'pct' ? '%' : undefined} placeholder={inputs.bridgingArrangementFeeMode === 'pct' ? '2' : '0'} />
                </View>
                <View style={styles.feeModeToggle}>
                  <TouchableOpacity style={[styles.modeBtn, inputs.bridgingArrangementFeeMode === 'pct' && styles.modeBtnActive]} onPress={() => setInputs(prev => ({ ...prev, bridgingArrangementFeeMode: 'pct' }))}><Text style={[styles.modeBtnText, inputs.bridgingArrangementFeeMode === 'pct' && styles.modeBtnTextActive]}>%</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.modeBtn, inputs.bridgingArrangementFeeMode === 'fixed' && styles.modeBtnActive]} onPress={() => setInputs(prev => ({ ...prev, bridgingArrangementFeeMode: 'fixed' }))}><Text style={[styles.modeBtnText, inputs.bridgingArrangementFeeMode === 'fixed' && styles.modeBtnTextActive]}>£</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.feeRow}>
                <View style={styles.feeInput}>
                  <InputField label="Valuation Fee" value={inputs.bridgingValuationFee} onChangeText={set('bridgingValuationFee')} prefix={inputs.bridgingValuationFeeMode === 'fixed' ? '£' : undefined} suffix={inputs.bridgingValuationFeeMode === 'pct' ? '%' : undefined} placeholder={inputs.bridgingValuationFeeMode === 'pct' ? '0.5' : '500'} />
                </View>
                <View style={styles.feeModeToggle}>
                  <TouchableOpacity style={[styles.modeBtn, inputs.bridgingValuationFeeMode === 'pct' && styles.modeBtnActive]} onPress={() => setInputs(prev => ({ ...prev, bridgingValuationFeeMode: 'pct' }))}><Text style={[styles.modeBtnText, inputs.bridgingValuationFeeMode === 'pct' && styles.modeBtnTextActive]}>%</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.modeBtn, inputs.bridgingValuationFeeMode === 'fixed' && styles.modeBtnActive]} onPress={() => setInputs(prev => ({ ...prev, bridgingValuationFeeMode: 'fixed' }))}><Text style={[styles.modeBtnText, inputs.bridgingValuationFeeMode === 'fixed' && styles.modeBtnTextActive]}>£</Text></TouchableOpacity>
                </View>
              </View>
              <InputField label="Monthly Interest Rate" value={inputs.bridgingMonthlyInterestRate} onChangeText={set('bridgingMonthlyInterestRate')} suffix="% /mo" placeholder="0.75" hint="e.g. 0.75% per month" />
              <InputField label="Exit Fee" value={inputs.bridgingExitFee} onChangeText={set('bridgingExitFee')} prefix="£" placeholder="0" />
              <InputField label="Broker Fees" value={inputs.bridgingBrokerFees} onChangeText={set('bridgingBrokerFees')} prefix="£" placeholder="0" />
              <InputField label="Other Fees" value={inputs.bridgingOtherFees} onChangeText={set('bridgingOtherFees')} prefix="£" placeholder="0" />
            </View>
          )}

          {/* BTL: mortgage valuation */}
          {inputs.strategy === 'btl' && (
            <InputField
              label="Mortgage Valuation"
              value={inputs.mortgageValuation}
              onChangeText={set('mortgageValuation')}
              prefix="£"
              placeholder={inputs.purchasePrice || 'e.g. 200000'}
              hint="Lender's assessed value — leave blank to use purchase price"
            />
          )}

          {/* HMO / STL: standard or commercial mortgage type */}
          {(inputs.strategy === 'hmo' || inputs.strategy === 'stl') && (
            <View style={[styles.toggleRow, { marginBottom: spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Mortgage Type</Text>
                <Text style={styles.hint}>Income-based commercial lending</Text>
              </View>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segBtn, inputs.mortgageType === 'standard' && styles.segBtnActive]}
                  onPress={() => setInputs(prev => ({ ...prev, mortgageType: 'standard' }))}
                >
                  <Text style={[styles.segBtnText, inputs.mortgageType === 'standard' && styles.segBtnTextActive]}>Standard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segBtn, inputs.mortgageType === 'commercial' && styles.segBtnActive]}
                  onPress={() => setInputs(prev => ({ ...prev, mortgageType: 'commercial' }))}
                >
                  <Text style={[styles.segBtnText, inputs.mortgageType === 'commercial' && styles.segBtnTextActive]}>Commercial</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {(inputs.strategy === 'hmo' || inputs.strategy === 'stl') && inputs.mortgageType === 'commercial' && (
            <InputField
              label="Commercial Valuation"
              value={inputs.commercialValuation}
              onChangeText={set('commercialValuation')}
              prefix="£"
              placeholder="e.g. 350000"
              hint="Income-based value the lender uses — LTV applied against this"
            />
          )}

          <InputField label="Deposit %" value={inputs.depositPct} onChangeText={set('depositPct')} suffix="%" placeholder="25" />
          <InputField label="Mortgage Arrangement Fee" value={inputs.mortgageFee} onChangeText={set('mortgageFee')} prefix="£" />
          {(() => {
            const midRate = marketData ? marketData.btlMortgageRate.value : 5.5;
            const irMin = Math.max(0.5, Math.round((midRate - 3) * 2) / 2);
            const irMax = Math.round((midRate + 3) * 2) / 2;
            const fetchedAt = marketData ? new Date(marketData.fetchedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
            return (
              <SliderField
                label="Interest Rate"
                value={inputs.interestRate}
                onChangeText={set('interestRate')}
                min={irMin} max={irMax} step={0.1} suffix="%" decimals={1}
                source={marketData ? marketData.btlMortgageRate.source : undefined}
                note={marketData ? `BoE base rate ${marketData.baseRate.value}% + 1.5% typical BTL spread (${fetchedAt})` : undefined}
              />
            );
          })()}
          <InputField label="Initial Term" value={inputs.mortgageInitialTerm} onChangeText={set('mortgageInitialTerm')} suffix="yrs" placeholder="2" hint="Fixed period before reversion" />
          {inputs.refinanceAfterRefurb === 'yes' && (
            <InputField label="New Mortgage LTV (after refurb)" value={inputs.newMortgagePct} onChangeText={set('newMortgagePct')} suffix="%" placeholder="75" hint="LTV on the refinanced product" />
          )}
        </View>

        {/* Income */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Income</Text>
          {inputs.strategy === 'stl' ? (
            <>
              <InputField label="Nightly Rate" value={inputs.nightlyRate} onChangeText={set('nightlyRate')} prefix="£" placeholder="85" />
              <InputField label="Occupancy" value={inputs.occupancyPct} onChangeText={set('occupancyPct')} suffix="%" placeholder="70" hint="Average % of nights booked" />
            </>
          ) : inputs.strategy === 'hmo' ? (
            <>
              <InputField label="Lettable Rooms" value={inputs.hmoRooms} onChangeText={set('hmoRooms')} placeholder="5" hint="Number of rooms let separately" />
              <InputField label="Rent per Room / Month" value={inputs.hmoRentPerRoom} onChangeText={set('hmoRentPerRoom')} prefix="£" placeholder="500" />
              <InputField label="Void (weeks / room / yr)" value={inputs.hmoVoidWeeksPerRoom} onChangeText={set('hmoVoidWeeksPerRoom')} placeholder="2" hint="Average empty weeks per room per year" />
            </>
          ) : (
            <InputField label="Monthly Rent" value={inputs.rentPerMonth} onChangeText={set('rentPerMonth')} prefix="£" placeholder="900" />
          )}
        </View>

        {/* STL costs — only shown for STL strategy */}
        {inputs.strategy === 'stl' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>STL / AirBnB Costs</Text>

            <Text style={styles.subSectionTitle}>Setup (one-time)</Text>
            <InputField label="Furnishing" value={inputs.stl_furnishing} onChangeText={set('stl_furnishing')} prefix="£" placeholder="0" />
            <CustomItemRows items={customStlSetup} onChange={setCustomStlSetup} placeholder="Setup item" />

            <Text style={[styles.subSectionTitle, { marginTop: spacing.md }]}>Monthly Running</Text>
            <InputField label="Cleaning" value={inputs.stl_cleaning} onChangeText={set('stl_cleaning')} prefix="£" placeholder="0" hint="Per month average" />
            <InputField label="Gardening" value={inputs.stl_gardening} onChangeText={set('stl_gardening')} prefix="£" placeholder="0" />
            <InputField label="Gas & Electric" value={inputs.stl_gasElectric} onChangeText={set('stl_gasElectric')} prefix="£" placeholder="0" />
            <InputField label="Internet" value={inputs.stl_internet} onChangeText={set('stl_internet')} prefix="£" placeholder="0" />
            <InputField label="Additional Maintenance" value={inputs.stl_additionalMaintenance} onChangeText={set('stl_additionalMaintenance')} prefix="£" placeholder="0" />
            <CustomItemRows items={customStlMonthly} onChange={setCustomStlMonthly} placeholder="Monthly item" monthly />
          </View>
        )}

        {/* HMO costs */}
        {inputs.strategy === 'hmo' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>HMO Costs</Text>

            <Text style={styles.subSectionTitle}>One-Time Setup</Text>
            <InputField label="Furnishing per Room" value={inputs.hmoFurnishingPerRoom} onChangeText={set('hmoFurnishingPerRoom')} prefix="£" placeholder="1500" hint="Per room × room count" />
            <InputField label="HMO Licence Fee" value={inputs.hmoLicenceFee} onChangeText={set('hmoLicenceFee')} prefix="£" placeholder="1000" hint="Mandatory for 5+ tenants; local authority varies" />
            <InputField label="Fire Safety Works" value={inputs.hmoFireSafety} onChangeText={set('hmoFireSafety')} prefix="£" placeholder="0" hint="Fire doors, interlinked alarms, extinguishers" />

            <Text style={[styles.subSectionTitle, { marginTop: spacing.md }]}>Monthly Running</Text>
            <View style={[styles.toggleRow, { marginBottom: spacing.sm }]}>
              <Text style={styles.label}>Bills included in rent?</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segBtn, inputs.hmoBillsIncluded === 'yes' && styles.segBtnActive]}
                  onPress={() => setInputs(prev => ({ ...prev, hmoBillsIncluded: 'yes' }))}
                >
                  <Text style={[styles.segBtnText, inputs.hmoBillsIncluded === 'yes' && styles.segBtnTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segBtn, inputs.hmoBillsIncluded === 'no' && styles.segBtnActive]}
                  onPress={() => setInputs(prev => ({ ...prev, hmoBillsIncluded: 'no' }))}
                >
                  <Text style={[styles.segBtnText, inputs.hmoBillsIncluded === 'no' && styles.segBtnTextActive]}>No</Text>
                </TouchableOpacity>
              </View>
            </View>
            {inputs.hmoBillsIncluded === 'yes' && (
              <InputField label="Utilities / Month" value={inputs.hmoUtilitiesMonthly} onChangeText={set('hmoUtilitiesMonthly')} prefix="£" placeholder="300" hint="Gas, electric, water, broadband combined" />
            )}
            <InputField label="Common Area Cleaning / Month" value={inputs.hmoCleaningMonthly} onChangeText={set('hmoCleaningMonthly')} prefix="£" placeholder="150" />
          </View>
        )}

        {/* OPEX */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>General Costs</Text>
          <InputField label="Service Charge / Ground Rent (annual)" value={inputs.serviceCharge} onChangeText={set('serviceCharge')} prefix="£" placeholder="0" />
          <InputField label="Buildings & Landlord Insurance (annual)" value={inputs.insurance} onChangeText={set('insurance')} prefix="£" placeholder="800" />
          <InputField label="Management Fee" value={inputs.mgmtFeePct} onChangeText={set('mgmtFeePct')} suffix="%" placeholder="10" hint="% of rent — set 0 if self-managing" />
          <InputField label="Maintenance Reserve" value={inputs.maintenancePct} onChangeText={set('maintenancePct')} suffix="%" placeholder="5" hint="% of rent set aside for repairs" />
          <InputField label="Gas Safety Cert (annual)" value={inputs.gasCertAnnual} onChangeText={set('gasCertAnnual')} prefix="£" placeholder="60" hint="CP12 — required every year" />
          <InputField label="Electrical Safety Cert (5-yearly)" value={inputs.elecCertFiveYear} onChangeText={set('elecCertFiveYear')} prefix="£" placeholder="200" hint="EICR — cost spread over 5 years" />
          {inputs.strategy !== 'hmo' && (
            <InputField label="Void Allowance (months/yr)" value={inputs.voidMonths} onChangeText={set('voidMonths')} placeholder="0.5" hint="Average empty months per year" />
          )}
        </View>

        {/* 5yr projection */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>5-Year Projection</Text>
            {marketData && (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                  const fwd = marketData.forwardRates;
                  const termInfo = fwd ? getForwardRateForTerm(inputs.mortgageInitialTerm, fwd) : null;
                  setInputs(prev => ({
                    ...prev,
                    capitalGrowthPct: String(marketData.housePriceGrowth.value),
                    annualIncomeIncreasePct: String(marketData.rentalGrowth.value),
                    mortgageFutureRate: termInfo ? String(termInfo.btlRate) : prev.mortgageFutureRate,
                  }));
                }}
              >
                <Text style={styles.resetBtnText}>↺ Reset to market data</Text>
              </TouchableOpacity>
            )}
          </View>
          {(() => {
            const midHpg = marketData ? marketData.housePriceGrowth.value : 3.5;
            const hMin = Math.round(-midHpg);
            const hMax = Math.round(3 * midHpg);
            return (
              <SliderField
                label="Annual Capital Growth %"
                value={inputs.capitalGrowthPct}
                onChangeText={set('capitalGrowthPct')}
                min={hMin} max={hMax} step={0.5} suffix="%" decimals={1}
                source={marketData ? marketData.housePriceGrowth.source : undefined}
                note={marketData ? `UK average annual house price growth. Source: ${marketData.housePriceGrowth.source}.` : undefined}
              />
            );
          })()}
          {(() => {
            const midRental = marketData ? marketData.rentalGrowth.value : 5.0;
            const rMin = Math.round(-midRental);
            const rMax = Math.round(3 * midRental);
            return (
              <SliderField
                label={inputs.strategy === 'stl' ? 'Annual Nightly Rate Increase %' : 'Annual Rental Increase %'}
                value={inputs.annualIncomeIncreasePct}
                onChangeText={set('annualIncomeIncreasePct')}
                min={rMin} max={rMax} step={0.5} suffix="%" decimals={1}
                source={marketData ? marketData.rentalGrowth.source : undefined}
                note={marketData ? `UK private rental price inflation. Source: ${marketData.rentalGrowth.source}. Applied to income each year in 5yr projection.` : undefined}
              />
            );
          })()}
          {(() => {
            const fwd = marketData?.forwardRates;
            const termInfo = fwd ? getForwardRateForTerm(inputs.mortgageInitialTerm, fwd) : null;
            const midFwd = termInfo?.btlRate ?? 5.0;
            const fMin = Math.round(-midFwd);
            const fMax = Math.round(3 * midFwd);
            const fwdSource = fwd?.source ?? 'SONIA OIS swap rates';
            return (
              <SliderField
                label="Expected Future Rate"
                value={inputs.mortgageFutureRate}
                onChangeText={set('mortgageFutureRate')}
                min={fMin} max={fMax} step={0.1} suffix="%" decimals={1}
                source={termInfo ? `${termInfo.tenorLabel} fwd: ${termInfo.btlRate}%` : undefined}
                note={termInfo
                  ? `Market-implied BoE base rate in ${termInfo.tenorLabel}: ${termInfo.baseRate}% + 1.5% BTL spread. Source: ${fwdSource}.`
                  : `Rate at end of initial term — used for stress test & 5yr projection`}
              />
            );
          })()}
        </View>

        {/* Results */}
        {results ? (
          <View style={styles.results}>
            <Text style={[styles.resultsTitle, { color: stratColor }]}>Results</Text>

            <SectionDivider title="Costs Summary" />
            {results.capitalOnPurchase != null && (
              <ResultRow
                label="Capital on Purchase"
                value={fmtGbp(results.capitalOnPurchase)}
                highlight={results.capitalOnPurchase > 0}
                negative={results.capitalOnPurchase < 0}
              />
            )}
            <ResultRow label="Deposit" value={fmtGbp(parseFloat(inputs.purchasePrice.replace(/,/g, '') || '0') * parseFloat(inputs.depositPct || '0') / 100)} />
            <ResultRow label="Stamp Duty (SDLT)" value={fmtGbp(results.stampDuty)} />
            <ResultRow label="Total Purchase Costs" value={fmtGbp(results.totalPurchaseCosts)} />
            {inputs.strategy === 'stl' && results.stlSetupCost > 0 && (
              <ResultRow label="STL Setup Cost" value={fmtGbp(results.stlSetupCost)} />
            )}
            {inputs.strategy === 'hmo' && results.hmoSetupCost > 0 && (
              <ResultRow label="HMO Setup Cost" value={fmtGbp(results.hmoSetupCost)} />
            )}
            <ResultRow label="Total Capital Invested" value={fmtGbp(results.totalInvested)} highlight />

            <SectionDivider title="Mortgage" />
            {results.commercialInvestmentValue != null && (
              <ResultRow label="Commercial Valuation" value={fmtGbp(results.commercialInvestmentValue)} muted />
            )}
            <ResultRow label="Mortgage Amount" value={fmtGbp(results.mortgageAmount)} />
            <ResultRow label="Monthly Payment (IO)" value={fmtGbp(results.monthlyMortgage)} />
            {results.monthlyFutureMortgage != null && (
              <ResultRow
                label={`At Future Rate (${inputs.mortgageFutureRate}%)`}
                value={fmtGbp(results.monthlyFutureMortgage)}
                muted
              />
            )}

            {inputs.refinanceAfterRefurb === 'yes' && results.initialFinancingCost != null && (
              <>
                <SectionDivider title="Bridging Finance" />
                {results.initialFinancingInterest != null && (
                  <ResultRow label="Total Interest" value={fmtGbp(results.initialFinancingInterest)} muted indent />
                )}
                <ResultRow label="Total Financing Cost" value={fmtGbp(results.initialFinancingCost)} negative />
              </>
            )}

            {inputs.refinanceAfterRefurb === 'yes' && results.newMortgageAmount != null && (
              <>
                <SectionDivider title="BRR — Refinance" />
                <ResultRow label="New Mortgage (after refurb)" value={fmtGbp(results.newMortgageAmount)} />
                <ResultRow label="Capital Extracted" value={fmtGbp(results.valueExtracted ?? 0)} highlight={(results.valueExtracted ?? 0) > 0} negative={(results.valueExtracted ?? 0) < 0} />
                <ResultRow label="Capital Left In" value={fmtGbp(results.capitalLeftIn ?? 0)} highlight />
              </>
            )}

            <SectionDivider title="Cashflow" />
            <ResultRow label="Monthly Gross Income" value={fmtGbp(results.monthlyGrossIncome)} />
            <ResultRow label="Monthly Mortgage" value={fmtGbp(-results.monthlyMortgage)} negative />
            <ResultRow label="Monthly OPEX" value={fmtGbp(-results.monthlyOpex)} negative />
            {inputs.strategy === 'stl' && results.stlMonthlyCosts > 0 && (
              <ResultRow label="  STL Running Costs" value={fmtGbp(-results.stlMonthlyCosts)} negative indent muted />
            )}
            {inputs.strategy === 'hmo' && results.hmoMonthlyCosts > 0 && (
              <ResultRow label="  HMO Running Costs" value={fmtGbp(-results.hmoMonthlyCosts)} negative indent muted />
            )}
            <ResultRow label="Monthly Net Cashflow" value={fmtGbp(results.monthlyNetCashflow)} highlight={results.monthlyNetCashflow > 0} negative={results.monthlyNetCashflow < 0} />
            <ResultRow label="Annual Net Cashflow" value={fmtGbp(results.annualNetCashflow)} highlight={results.annualNetCashflow > 0} negative={results.annualNetCashflow < 0} />

            <SectionDivider title="Returns" />
            <ResultRow label="Gross Yield" value={fmtPct(results.grossYield)} />
            <ResultRow label="Net Yield" value={fmtPct(results.netYield)} highlight={results.netYield > 4} negative={results.netYield < 0} />
            <ResultRow label="Cash-on-Cash Return" value={fmtPct(results.cashOnCash)} highlight={results.cashOnCash > 6} negative={results.cashOnCash < 0} />
            <ResultRow label="Cash Left In" value={fmtGbp(results.capitalLeftIn ?? results.totalInvested)} highlight />
            <ResultRow label="5yr Total Return" value={fmtGbp(results.projection5yr.totalReturn)} highlight={results.projection5yr.totalReturn > 0} negative={results.projection5yr.totalReturn < 0} />

            {/* Stress test */}
            <TouchableOpacity style={styles.expandRow} onPress={() => setShowStress(v => !v)}>
              <Text style={styles.expandLabel}>Stress Test</Text>
              <Text style={styles.expandChevron}>{showStress ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showStress && (
              <View style={styles.stressBox}>
                <Text style={styles.stressNote}>Monthly cashflow under adverse conditions:</Text>
                <ResultRow label="Rent drops 10%" value={fmtGbp(results.stress.rent10pctDrop)} negative={results.stress.rent10pctDrop < 0} />
                <ResultRow label={futureRateLabel} value={fmtGbp(results.stress.ratesAtFutureRate)} negative={results.stress.ratesAtFutureRate < 0} />
                <ResultRow label="4-week void" value={fmtGbp(results.stress.void4weeks)} negative={results.stress.void4weeks < 0} />
              </View>
            )}

            {/* 5yr projection */}
            <TouchableOpacity style={styles.expandRow} onPress={() => setShowProjection(v => !v)}>
              <Text style={styles.expandLabel}>5-Year Projection ({inputs.capitalGrowthPct}% growth, {inputs.annualIncomeIncreasePct}% income/yr)</Text>
              <Text style={styles.expandChevron}>{showProjection ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showProjection && (
              <View style={styles.stressBox}>
                <ResultRow label="Estimated Value" value={fmtGbp(results.projection5yr.estimatedValue)} />
                <ResultRow label="Capital Growth" value={fmtGbp(results.projection5yr.capitalGrowth)} highlight />
                <ResultRow label="Cumulative Cashflow" value={fmtGbp(results.projection5yr.cumulativeCashflow)} highlight={results.projection5yr.cumulativeCashflow > 0} negative={results.projection5yr.cumulativeCashflow < 0} />
                <ResultRow label="Total 5yr Return" value={fmtGbp(results.projection5yr.totalReturn)} highlight />
              </View>
            )}

          {editingDealId !== null ? (
            <View style={styles.editingActionRow}>
              <TouchableOpacity style={[styles.saveBtn, { borderColor: stratColor, flex: 1, marginRight: 8 }]} onPress={updateDeal}>
                <Text style={[styles.saveBtnText, { color: stratColor }]}>✓ Update Deal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { borderColor: colors.textMuted, flex: 1 }]} onPress={() => { setEditingDealId(null); setView('saved'); }}>
                <Text style={[styles.saveBtnText, { color: colors.textMuted }]}>✕ Exit</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.saveBtn, { borderColor: stratColor }]} onPress={saveDeal}>
              <Text style={[styles.saveBtnText, { color: stratColor }]}>+ Save Deal</Text>
            </TouchableOpacity>
          )}
          </View>
        ) : (
          <View style={styles.emptyResults}>
            <Text style={styles.emptyText}>Enter a purchase price to see results</Text>
          </View>
        )}

        </> /* end calculator view */}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Bottom navigation */}
      <View style={styles.bottomNav}>
        {([
          { key: 'calculator', label: 'Calculator', icon: '⌗' },
          { key: 'duediligence', label: 'Due Diligence', icon: '🔍' },
          { key: 'saved', label: `Saved${savedDeals.length > 0 ? ` (${savedDeals.length})` : ''}`, icon: '⊞' },
          { key: 'guide', label: 'Guide', icon: '⊙' },
        ] as { key: typeof view; label: string; icon: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.bottomNavTab}
            onPress={() => setView(tab.key)}
          >
            <Text style={[styles.bottomNavIcon, view === tab.key && styles.bottomNavActive]}>{tab.icon}</Text>
            <Text style={[styles.bottomNavLabel, view === tab.key && styles.bottomNavActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.md },
  title: { color: colors.text, fontSize: font.sizes.xl, fontWeight: '700', marginBottom: 2 },
  subtitle: { color: colors.textSecondary, fontSize: font.sizes.sm, marginBottom: spacing.md },

  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    paddingVertical: spacing.xs,
  },
  bottomNavTab: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  bottomNavIcon: { fontSize: 18, color: colors.tabBarInactive, marginBottom: 2 },
  bottomNavLabel: { fontSize: 10, color: colors.tabBarInactive, fontWeight: '600' },
  bottomNavActive: { color: colors.tabBarActive },

  guideSection: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  guideHeading: { color: colors.text, fontSize: font.sizes.md, fontWeight: '700', marginBottom: spacing.xs },
  guideBody: { color: colors.textSecondary, fontSize: font.sizes.sm, lineHeight: 20, marginBottom: spacing.xs },
  guidePill: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  guidePillLabel: { color: colors.textSecondary, fontSize: font.sizes.sm },
  guidePillVal: { color: colors.primary, fontSize: font.sizes.sm, fontWeight: '700' },

  ddTabBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ddTabBarContent: { flexDirection: 'row', padding: 4, gap: 2 },
  ddTab: { paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', borderRadius: radius.sm },
  ddTabActive: { backgroundColor: colors.primary },
  ddTabText: { fontSize: font.sizes.sm, fontWeight: '600', color: colors.textSecondary },
  ddTabTextActive: { color: '#fff' },

  postcodeRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.xs },
  floodBadge: { alignItems: 'center', justifyContent: 'center', width: 44, flexShrink: 0 },
  floodBadgeText: { fontSize: 22, lineHeight: 28 },
  floodBadgeLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '600', marginTop: 1 },

  floodLevelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  floodLevelIcon: { fontSize: 28, lineHeight: 34 },
  floodLevelLabel: { color: colors.text, fontSize: font.sizes.md, fontWeight: '700', marginBottom: 2 },
  floodLevelSub: { color: colors.textSecondary, fontSize: font.sizes.sm },
  floodAreaList: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  floodAreaRow: { paddingVertical: 8, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  floodAreaLabel: { color: colors.text, fontSize: font.sizes.sm, fontWeight: '600' },
  floodAreaMeta: { color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 2 },
  floodDisclaimer: { color: colors.textMuted, fontSize: 10, fontStyle: 'italic' },

  soldTabHeader: { marginBottom: spacing.md },
  soldTabTitle: { color: colors.text, fontSize: font.sizes.xl, fontWeight: '700', marginBottom: 4 },
  soldTabSubtitle: { color: colors.textMuted, fontSize: font.sizes.sm },
  soldSearchRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  soldPostcodeInput: { flex: 1, backgroundColor: colors.inputBg, color: colors.inputText, fontSize: font.sizes.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  soldSearchBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.sm, justifyContent: 'center' },
  soldSearchBtnDisabled: { opacity: 0.5 },
  soldSearchBtnText: { color: '#fff', fontSize: font.sizes.md, fontWeight: '700' },
  soldError: { color: colors.negative, fontSize: font.sizes.xs, marginBottom: spacing.sm },
  soldNone: { color: colors.textMuted, fontSize: font.sizes.sm, marginBottom: spacing.sm },
  soldTable: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  soldTableHeader: { flexDirection: 'row', backgroundColor: colors.surface2, paddingVertical: 8, paddingHorizontal: 6 },
  soldHeaderText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  soldTableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, alignItems: 'flex-start' },
  soldTableRowAlt: { backgroundColor: colors.surface2 + '55' },
  soldColAddress: { flex: 3, color: colors.text, fontSize: 11, paddingRight: 4 },
  soldColType: { flex: 2, color: colors.textSecondary, fontSize: 11, paddingRight: 4 },
  soldColPrice: { flex: 2, color: colors.primary, fontSize: 11, fontWeight: '700', textAlign: 'right', paddingRight: 4 },
  soldColDate: { flex: 1.5, color: colors.textMuted, fontSize: 10, textAlign: 'right' },
  soldFootnote: { color: colors.textMuted, fontSize: 10, padding: 6, borderTopWidth: 1, borderTopColor: colors.border },

  savedGrid: { gap: spacing.md },
  savedCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  savedCardAddress: { color: colors.text, fontSize: font.sizes.md, fontWeight: '700', marginBottom: spacing.sm, lineHeight: 22 },
  savedCardDivider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.sm },
  savedCardActions: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  savedCardBtn: { flex: 1, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center' },
  savedCardBtnText: { fontSize: font.sizes.xs, fontWeight: '700' },
  stratBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  stratBadgeText: { fontSize: font.sizes.sm, fontWeight: '700' },

  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabText: { color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: font.sizes.md, fontWeight: '700', marginBottom: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  subSectionTitle: { color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: '600', marginBottom: spacing.xs },
  subCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm },
  label: { color: colors.text, fontSize: font.sizes.md, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 2 },
  subtotal: { color: colors.textSecondary, fontSize: font.sizes.sm, marginTop: spacing.xs, textAlign: 'right' },

  resetBtn: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  resetBtnText: { color: colors.primary, fontSize: font.sizes.xs, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  segmentRow: { flexDirection: 'row', gap: spacing.xs },
  segBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  segBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  segBtnText: { color: colors.textSecondary, fontSize: font.sizes.sm },
  segBtnTextActive: { color: colors.primary, fontWeight: '600' },
  taxNote: { color: colors.warning, fontSize: font.sizes.xs, marginTop: 2 },
  taxNoteGreen: { color: colors.positive, fontSize: font.sizes.xs, marginTop: 2 },

  sdltToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  sdltLabel: { color: colors.textSecondary, fontSize: font.sizes.sm },
  sdltChevron: { color: colors.textMuted, fontSize: font.sizes.sm },
  sdltBreakdown: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  sdltNote: { color: colors.textMuted, fontSize: font.sizes.xs, marginBottom: spacing.xs, fontStyle: 'italic' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  customLabel: {
    flex: 1, color: colors.text, fontSize: font.sizes.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    backgroundColor: colors.surface2,
  },
  customAmount: {
    width: 80, color: colors.text, fontSize: font.sizes.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    backgroundColor: colors.surface2, textAlign: 'right',
  },
  removeBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  removeBtnText: { color: colors.textMuted, fontSize: 12 },
  addBtn: {
    paddingVertical: 8, alignItems: 'center',
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', marginTop: spacing.xs,
  },
  addBtnText: { color: colors.textSecondary, fontSize: font.sizes.sm },

  feeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  feeInput: { flex: 1 },
  feeModeToggle: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  modeBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  modeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  modeBtnText: { color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: '600' },
  modeBtnTextActive: { color: colors.primary },

  results: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  resultsTitle: { fontSize: font.sizes.lg, fontWeight: '700', marginBottom: spacing.sm },

  expandRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  expandLabel: { color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: '600' },
  expandChevron: { color: colors.textMuted },
  stressBox: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.xs },
  stressNote: { color: colors.textMuted, fontSize: font.sizes.xs, marginBottom: spacing.xs, fontStyle: 'italic' },

  emptyResults: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.textMuted, fontSize: font.sizes.md },

  saveBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  saveBtnText: { fontSize: font.sizes.sm, fontWeight: '700' },
  editingActionRow: { flexDirection: 'row', marginTop: spacing.md },

  compareSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compareTitle: { color: colors.text, fontSize: font.sizes.md, fontWeight: '700' },
  clearAll: { color: colors.textMuted, fontSize: font.sizes.xs },
  csvBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  csvBtnText: { color: colors.primary, fontSize: font.sizes.xs, fontWeight: '700' },
  planningNote: { color: colors.textMuted, fontSize: font.sizes.xs, fontStyle: 'italic', marginBottom: spacing.sm },
  planningList: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.sm },
  planningRow: { padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  planningRowAlt: { backgroundColor: colors.surface2 + '55' },
  planningRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  planningRef: { color: colors.textSecondary, fontSize: 10, fontWeight: '700', flex: 1, paddingRight: 4 },
  planningDecision: { fontSize: 10, fontWeight: '700' },
  planningAddress: { color: colors.text, fontSize: font.sizes.sm, marginBottom: 2 },
  planningDesc: { color: colors.textMuted, fontSize: font.sizes.xs, lineHeight: 16, marginBottom: 2 },
  planningDate: { color: colors.textMuted, fontSize: 10 },
  compareScroll: { paddingTop: spacing.sm, gap: spacing.sm },

  dealCard: {
    width: 160,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  dealCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  dealCardStrategy: { fontSize: font.sizes.sm, fontWeight: '700' },
  dealCardRemove: { color: colors.textMuted, fontSize: 16, paddingLeft: spacing.sm },
  dealCardAddress: { color: colors.text, fontSize: font.sizes.md, fontWeight: '600', marginBottom: spacing.sm, lineHeight: 22 },
  dealCardDivider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.sm },
  dealCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  dealCardKey: { color: colors.textMuted, fontSize: font.sizes.sm },
  dealCardVal: { color: colors.text, fontSize: font.sizes.md, fontWeight: '600' },
});
