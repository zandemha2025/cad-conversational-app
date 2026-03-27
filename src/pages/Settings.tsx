import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Bell, Shield, Package, Cpu, ChevronRight, ChevronLeft,
  Save, CheckCircle2, Building, Mail, Settings2,
} from 'lucide-react';
import { getSettings, saveSettings } from '../lib/storage';
import type { StoredSettings } from '../lib/storage';

type Section = 'profile' | 'notifications' | 'standards' | 'hardware' | 'ai';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'profile',       label: 'Profile',               icon: <User size={15} />,    description: 'Name, email, company, role' },
  { id: 'notifications', label: 'Notifications',          icon: <Bell size={15} />,    description: 'Alerts, DFM warnings, email digests' },
  { id: 'standards',     label: 'Standards & Compliance', icon: <Shield size={15} />,  description: 'GD&T standard, quality system, ITAR' },
  { id: 'hardware',      label: 'Hardware Library',        icon: <Package size={15} />, description: 'Default materials, fastener preferences' },
  { id: 'ai',            label: 'AI & Generation',         icon: <Cpu size={15} />,     description: 'Model, prompt style, generation defaults' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';

function SSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-700'}`}
        type="button"
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [active, setActive] = useState<Section>('profile');
  const [settings, setSettings] = useState<StoredSettings>(getSettings);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<StoredSettings>) => {
    setSettings(s => ({ ...s, ...patch }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-4 shrink-0">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors flex items-center gap-1.5">
          <ChevronLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Settings2 size={16} className="text-blue-400" />
          <span className="text-white font-semibold text-sm">Settings</span>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            saved ? 'bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r border-gray-800 bg-gray-900 p-3 shrink-0">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left mb-0.5 transition-colors ${
                active === s.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              <span className={active === s.id ? 'text-blue-400' : 'text-gray-500'}>{s.icon}</span>
              <span className="text-sm font-medium">{s.label}</span>
              <ChevronRight size={12} className="ml-auto text-gray-600" />
            </button>
          ))}
        </div>

        {/* Content pane */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-xl space-y-6">

            {active === 'profile' && (
              <>
                <div>
                  <h2 className="text-white font-semibold text-lg">Profile</h2>
                  <p className="text-gray-500 text-sm mt-1">Your identity shown on drawings and exports.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name">
                    <input value={settings.fullName} onChange={e => update({ fullName: e.target.value })}
                      placeholder="Jane Smith" className={inputCls} />
                  </Field>
                  <Field label="Role / Title">
                    <input value={settings.role} onChange={e => update({ role: e.target.value })}
                      placeholder="Fixture Design Engineer" className={inputCls} />
                  </Field>
                </div>
                <Field label="Email">
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input type="email" value={settings.email} onChange={e => update({ email: e.target.value })}
                      placeholder="engineer@company.com"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                </Field>
                <Field label="Company">
                  <div className="relative">
                    <Building size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input value={settings.company} onChange={e => update({ company: e.target.value })}
                      placeholder="ACME Manufacturing"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                </Field>
                <div className="space-y-1 divide-y divide-gray-800">
                  <Toggle checked={settings.autoSave} onChange={v => update({ autoSave: v })} label="Auto-save projects" />
                  <Toggle checked={settings.theme === 'dark'} onChange={v => update({ theme: v ? 'dark' : 'light' })} label="Dark theme" />
                </div>
              </>
            )}

            {active === 'notifications' && (
              <>
                <div>
                  <h2 className="text-white font-semibold text-lg">Notifications</h2>
                  <p className="text-gray-500 text-sm mt-1">Control when and how ForgeAI alerts you.</p>
                </div>
                <div className="space-y-1 divide-y divide-gray-800">
                  <Toggle checked={settings.enableDfmWarnings} onChange={v => update({ enableDfmWarnings: v })} label="Show DFM warnings in viewport" />
                  <Toggle checked={settings.alertOnJobDone} onChange={v => update({ alertOnJobDone: v })} label="Alert when generation job completes" />
                  <Toggle checked={settings.weeklyDigestEmail} onChange={v => update({ weeklyDigestEmail: v })} label="Weekly project digest email" />
                  <Toggle checked={settings.validationErrorsBeforeExport} onChange={v => update({ validationErrorsBeforeExport: v })} label="Validation errors before export" />
                  <Toggle checked={settings.browserNotificationOnDone} onChange={v => update({ browserNotificationOnDone: v })} label="Browser notification on job done" />
                </div>
              </>
            )}

            {active === 'standards' && (
              <>
                <div>
                  <h2 className="text-white font-semibold text-lg">Standards & Compliance</h2>
                  <p className="text-gray-500 text-sm mt-1">Defaults applied to new projects and drawings.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="GD&T Standard">
                    <SSelect value={settings.defaultGdtStandard} onChange={v => update({ defaultGdtStandard: v })} options={[
                      { value: 'ASME Y14.5-2018', label: 'ASME Y14.5-2018' },
                      { value: 'ASME Y14.5-2009', label: 'ASME Y14.5-2009' },
                      { value: 'ISO 1101:2017',   label: 'ISO 1101:2017' },
                    ]} />
                  </Field>
                  <Field label="Quality Standard">
                    <SSelect value={settings.defaultQualityStandard} onChange={v => update({ defaultQualityStandard: v })} options={[
                      { value: 'AS9100',     label: 'AS9100 Rev D' },
                      { value: 'ISO 9001',   label: 'ISO 9001:2015' },
                      { value: 'IATF 16949', label: 'IATF 16949' },
                      { value: 'none',       label: 'None' },
                    ]} />
                  </Field>
                </div>
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={14} className="text-amber-400" />
                    <span className="text-amber-400 text-sm font-medium">ITAR Notice</span>
                  </div>
                  <p className="text-amber-300/70 text-xs leading-relaxed">
                    For ITAR-controlled programs, deploy on-premises or on GovCloud. The hosted demo at scalecad.io is <strong>NOT ITAR-compliant</strong>. Contact your administrator for a compliant deployment configuration.
                  </p>
                </div>
              </>
            )}

            {active === 'hardware' && (
              <>
                <div>
                  <h2 className="text-white font-semibold text-lg">Hardware Library</h2>
                  <p className="text-gray-500 text-sm mt-1">Default materials and hardware preferences for new projects.</p>
                </div>
                <Field label="Default Material">
                  <SSelect value={settings.defaultMaterial} onChange={v => update({ defaultMaterial: v })} options={[
                    { value: 'Aluminum 6061-T6', label: 'Aluminum 6061-T6' },
                    { value: 'Aluminum 7075-T6', label: 'Aluminum 7075-T6' },
                    { value: 'PA12-CF (FDM)',    label: 'PA12-CF (FDM Print)' },
                    { value: 'Steel 4140',       label: 'Steel 4140 HT' },
                    { value: 'Stainless 316L',   label: 'Stainless 316L' },
                  ]} />
                </Field>
                <div className="space-y-1 divide-y divide-gray-800">
                  <Toggle checked={settings.preferInStockItems} onChange={v => update({ preferInStockItems: v })} label="Prefer in-stock items from hardware library" />
                  <Toggle checked={settings.showSupplierPricing} onChange={v => update({ showSupplierPricing: v })} label="Show supplier pricing in BOM" />
                  <Toggle checked={settings.autoSuggestFasteners} onChange={v => update({ autoSuggestFasteners: v })} label="Auto-suggest fastener substitutions" />
                </div>
              </>
            )}

            {active === 'ai' && (
              <>
                <div>
                  <h2 className="text-white font-semibold text-lg">AI & Generation</h2>
                  <p className="text-gray-500 text-sm mt-1">Configure how ForgeAI's AI engine generates fixtures.</p>
                </div>
                <Field label="AI Model">
                  <SSelect value={settings.aiModel} onChange={v => update({ aiModel: v })} options={[
                    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (default, fastest)' },
                    { value: 'gemini-2.0-pro',   label: 'Gemini 2.0 Pro (most capable)' },
                    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy)' },
                  ]} />
                </Field>
                <div className="space-y-1 divide-y divide-gray-800">
                  <Toggle checked={settings.autoGenerateNodeGraph} onChange={v => update({ autoGenerateNodeGraph: v })} label="Generate node graph after fixture creation" />
                  <Toggle checked={settings.autoRunDfmValidation} onChange={v => update({ autoRunDfmValidation: v })} label="Auto-run DFM validation after generation" />
                  <Toggle checked={settings.includeDesignRationale} onChange={v => update({ includeDesignRationale: v })} label="Include design rationale in chat responses" />
                  <Toggle checked={settings.suggestHardwareOnGenerate} onChange={v => update({ suggestHardwareOnGenerate: v })} label="Suggest hardware from library when generating" />
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs text-gray-400 font-medium mb-2">Backend Connection</p>
                  <p className="text-xs text-green-400">✓ Connected to backend — Gemini AI generation enabled</p>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
