import { Check, Copy, Download, FileJson, Filter, Package, Plus, Search, Shield, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { forkArtifact, previewImport, downloadArtifact, withChecksum } from '../domain/artifacts'
import type { ImportPreview, PackDefinition, RoleDefinition, ScenarioDefinition, TraitDefinition } from '../domain/types'
import { saveArtifact } from '../storage/db'

type Artifact = RoleDefinition | PackDefinition | ScenarioDefinition
interface Props { artifacts: Artifact[]; roles: RoleDefinition[]; packs: PackDefinition[]; scenarios: ScenarioDefinition[]; traitCatalogue: TraitDefinition[]; onRefresh: () => Promise<void>; onEdit: (artifact: Artifact) => void }

export default function Library({ artifacts, roles, packs, scenarios, traitCatalogue, onRefresh, onEdit }: Props) {
  const [tab, setTab] = useState<'roles' | 'packs' | 'scenarios'>('roles'), [query, setQuery] = useState(''), [faction, setFaction] = useState('all'), [category, setCategory] = useState('all')
  const [preview, setPreview] = useState<ImportPreview | null>(null), [importError, setImportError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const categories = [...new Set(roles.flatMap((role) => role.categories))].sort()
  const factions = [...new Set(roles.map((role) => role.faction))]
  const filtered = useMemo(() => roles.filter((role) => { const traitText = role.traits.map((id) => traitCatalogue.find((trait) => trait.id === id)?.label ?? id).join(' '); return !role.categories.includes('Status') && (!query || `${role.meta.name} ${role.text.description} ${traitText}`.toLowerCase().includes(query.toLowerCase())) && (faction === 'all' || role.faction === faction) && (category === 'all' || role.categories.includes(category)) }), [roles, traitCatalogue, query, faction, category])

  async function importFile(file?: File) {
    if (!file) return
    try { setImportError(''); setPreview(previewImport(await file.text(), artifacts)) } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not read that file.') }
  }
  async function confirmImport() {
    if (!preview) return
    const artifact = preview.status === 'fork' ? forkArtifact(preview.artifact) : structuredClone(preview.artifact)
    if (preview.status === 'unsupported') artifact.meta.unavailableReasons = preview.issues
    const ready = withChecksum(artifact)
    await saveArtifact(ready); await onRefresh(); setPreview(null)
  }
  function newArtifact(kind: 'role' | 'pack' | 'scenario') {
    const source = kind === 'role' ? roles.find((role) => role.meta.name === 'Farmer') ?? roles[0] : kind === 'pack' ? packs[0] : scenarios[0]
    const draft = forkArtifact(source as Artifact)
    draft.meta.name = kind === 'role' ? 'Untitled role' : kind === 'pack' ? 'Untitled pack' : 'Untitled scenario'
    onEdit(draft)
  }

  return <div className="library-page page-width">
    <div className="page-heading"><div><span className="eyebrow">RULES WORKSHOP</span><h1>Library & editors</h1><p>Browse, edit, import and share roles, packs and scenarios.</p></div><div className="heading-actions"><input ref={input} hidden type="file" accept=".json,.wwrole.json,.wwpack.json,.wwscenario.json" onChange={(event) => importFile(event.target.files?.[0])} /><button className="secondary" onClick={() => input.current?.click()}><Upload /> Import</button><button className="primary" onClick={() => newArtifact(tab === 'roles' ? 'role' : tab === 'packs' ? 'pack' : 'scenario')}><Plus /> New {tab.slice(0, -1)}</button></div></div>
    {importError && <div className="error-banner">{importError}</div>}
    {artifacts.some((artifact) => artifact.meta.unavailableReasons?.length) && <div className="unavailable-box"><strong>Unavailable imports retained</strong>{artifacts.filter((artifact) => artifact.meta.unavailableReasons?.length).map((artifact) => <p key={artifact.id}>{artifact.meta.name}: {artifact.meta.unavailableReasons?.join(' ')}</p>)}</div>}
    <div className="library-tabs"><button className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Roles <span>{roles.filter((role) => !role.categories.includes('Status')).length}</span></button><button className={tab === 'packs' ? 'active' : ''} onClick={() => setTab('packs')}>Packs <span>{packs.length}</span></button><button className={tab === 'scenarios' ? 'active' : ''} onClick={() => setTab('scenarios')}>Scenarios <span>{scenarios.length}</span></button></div>

    {tab === 'roles' && <><div className="filters"><label className="search"><Search /><input placeholder="Search names, traits, mechanics…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><Filter /><select value={faction} onChange={(event) => setFaction(event.target.value)}><option value="all">All factions</option>{factions.map((item) => <option key={item} value={item}>{item.split('.').at(-1)}</option>)}</select></label><label><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All mechanics</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="role-library-grid">{filtered.map((role) => <RoleCard key={`${role.id}-${role.meta.checksum}`} role={role} traitCatalogue={traitCatalogue} onEdit={() => onEdit(role)} />)}</div></>}
    {tab === 'packs' && <div className="artifact-grid">{packs.map((pack) => <ArtifactCard key={pack.id} artifact={pack} detail={`${pack.roles.filter((role) => !role.categories.includes('Status')).length} roles`} onEdit={() => onEdit(pack)} />)}</div>}
    {tab === 'scenarios' && <div className="artifact-grid">{scenarios.map((scenario) => <ArtifactCard key={scenario.id} artifact={scenario} detail={`${scenario.cyclePipeline.length} repeating phases · ${scenario.capabilities.length} capabilities`} onEdit={() => onEdit(scenario)} />)}</div>}

    {preview && <div className="modal-backdrop"><div className="modal import-modal"><button className="modal-close" onClick={() => setPreview(null)}><X /></button><span className="eyebrow">IMPORT PREVIEW</span><h2>{preview.artifact.meta.name}</h2><div className={`import-status ${preview.status}`}><FileJson /><div><strong>{preview.status === 'new' ? 'New definition' : preview.status === 'identical' ? 'Already installed' : preview.status === 'fork' ? 'Content conflict' : 'Unsupported but retained'}</strong><small>{preview.artifact.meta.namespace} · v{preview.artifact.meta.version} · schema {preview.artifact.meta.schemaVersion}</small></div></div>{preview.issues.map((issue) => <p className="warning-box" key={issue}>{issue}</p>)}<dl className="artifact-meta"><div><dt>Kind</dt><dd>{preview.artifact.meta.kind}</dd></div><div><dt>Checksum</dt><dd>{preview.artifact.meta.checksum}</dd></div><div><dt>Engine</dt><dd>{preview.artifact.meta.engineVersion}</dd></div></dl><button className="primary full" onClick={confirmImport} disabled={preview.status === 'identical'}>{preview.status === 'fork' ? 'Import as a safe fork' : preview.status === 'unsupported' ? 'Retain as unavailable' : 'Import definition'}</button></div></div>}
  </div>
}

function RoleCard({ role, traitCatalogue, onEdit }: { role: RoleDefinition; traitCatalogue: TraitDefinition[]; onEdit: () => void }) { const traits = role.traits.slice(0, 3).map((id) => traitCatalogue.find((trait) => trait.id === id) ?? { id, label: id.split('.').at(-1)?.replace(/-/g, ' ') ?? id, colour: '#8c857b' }); return <article className="role-card"><header><div className={`faction-mark ${role.faction.split('.').at(-1)}`}><Shield /></div><div><h3>{role.meta.name}</h3><span>{role.faction.split('.').at(-1)} · {role.meta.builtIn ? 'Built in' : `v${role.meta.version}`}</span></div></header><p>{role.text.summary}</p><div className="tag-row">{role.categories.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}{traits.map((trait) => <span className="tag trait-tag" style={{ borderColor: trait.colour, backgroundColor: `${trait.colour}1f` }} key={trait.id}><i style={{ backgroundColor: trait.colour }} />{trait.label}</span>)}</div><footer><button onClick={onEdit}>{role.meta.builtIn ? <><Copy /> View & clone</> : <>Edit definition</>}</button><button title="Export" onClick={() => downloadArtifact(role)}><Download /></button></footer></article> }
function ArtifactCard({ artifact, detail, onEdit }: { artifact: PackDefinition | ScenarioDefinition; detail: string; onEdit: () => void }) { return <article className="artifact-card"><Package /><span className="eyebrow">{artifact.meta.kind}</span><h2>{artifact.meta.name}</h2><p>{artifact.description}</p><small>{detail}</small><div className="tag-row"><span className="tag">v{artifact.meta.version}</span>{artifact.meta.builtIn && <span className="tag"><Check /> Built in</span>}</div><footer><button className="secondary" onClick={onEdit}>{artifact.meta.builtIn ? 'View & clone' : 'Edit'}</button><button className="icon-button" onClick={() => downloadArtifact(artifact)}><Download /></button></footer></article> }
