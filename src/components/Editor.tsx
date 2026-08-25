import { ArrowLeft, Beaker, Check, ChevronDown, Code2, Copy, Download, GripVertical, Plus, Save, Trash2, X, Zap } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { downloadArtifact, forkArtifact, withChecksum } from '../domain/artifacts'
import type { AbilityDefinition, Effect, PackDefinition, RoleDefinition, ScenarioDefinition, TraitDefinition, TriggerType } from '../domain/types'
import { runRoleTestBench } from '../engine/engine'
import { saveArtifact } from '../storage/db'

type Artifact = RoleDefinition | PackDefinition | ScenarioDefinition
const TRIGGERS: TriggerType[] = ['setup.action', 'night.action', 'vote.beforeTally', 'vote.afterTally', 'ballot.qualified', 'burn.resolving', 'burn.resolved', 'attack.attempted', 'attack.successful', 'attack.redirected', 'attack.resolving', 'attack.prevented', 'death.resolved', 'morning.beforeVictory', 'morning.announcements', 'victory.check']

const TEMPLATES: Array<{ name: string; effect: Effect; trigger: TriggerType }> = [
  { name: 'Information', trigger: 'night.action', effect: { type: 'inspectTrait', targets: { kind: 'chosen' }, trait: 'my.pack.trait.example', positive: 'MATCH', negative: 'NO MATCH' } },
  { name: 'Protection', trigger: 'night.action', effect: { type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'my.pack.status.protected', name: 'Protected', data: { attackType: 'shadow' } }, duration: 'night' } },
  { name: 'Attack', trigger: 'night.action', effect: { type: 'queueAttack', targets: { kind: 'chosen' }, attackType: 'shadow' } },
  { name: 'Voting', trigger: 'vote.beforeTally', effect: { type: 'modifyVotesReceived', targets: { kind: 'self' }, operation: 'multiply', value: 0.5, rounding: 'ceil' } },
  { name: 'Transformation', trigger: 'attack.resolving', effect: { type: 'transformRole', targets: { kind: 'self' }, roleId: 'my.pack.role.new-form' } },
  { name: 'Announcement', trigger: 'morning.announcements', effect: { type: 'announce', message: 'Write the public announcement.', visibility: 'public', category: 'News' } },
  { name: 'Relationship', trigger: 'setup.action', effect: { type: 'linkRelationship', targets: { kind: 'chosen' }, relationship: 'my.pack.relationship.link', reciprocal: 'my.pack.relationship.linked-by' } },
  { name: 'Alternate victory', trigger: 'death.resolved', effect: { type: 'personalWin', targets: { kind: 'self' }, reason: 'Describe the personal victory.' } },
]

const ACTION_GROUPS = [
  { value: '', label: 'Default position', description: 'Use the normal position for this action.' },
  { value: 'setup-information', label: 'First night · information', description: 'Resolve with first-night information actions.' },
  { value: 'relationships', label: 'First night · relationships', description: 'Resolve with first-night relationship choices.' },
  { value: 'information', label: 'Night · information', description: 'Resolve near the start of each night.' },
  { value: 'protection', label: 'Night · protection', description: 'Resolve before attacks are chosen.' },
  { value: 'after-protection', label: 'Night · attack selection', description: 'Resolve after protection choices and before attacks land.' },
  { value: 'after-attack-resolution', label: 'Night · after attacks', description: 'Resolve after night deaths are known.' },
]

export default function Editor({ artifact: initial, traitCatalogue, onSaved, onClose }: { artifact: Artifact; traitCatalogue: TraitDefinition[]; onSaved: (artifact: Artifact) => void; onClose: () => void }) {
  const [artifact, setArtifact] = useState<Artifact>(structuredClone(initial)), [mode, setMode] = useState<'guided' | 'advanced' | 'test'>('guided'), [json, setJson] = useState(JSON.stringify(initial, null, 2)), [message, setMessage] = useState('')
  const editable = !artifact.meta.builtIn
  const isRole = 'faction' in artifact
  async function save() { try { const next = withChecksum(artifact); await saveArtifact(next); setArtifact(next); setJson(JSON.stringify(next, null, 2)); setMessage('Saved locally.'); onSaved(next) } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save.') } }
  function cloneToEdit() { const next = forkArtifact(artifact); setArtifact(next); setJson(JSON.stringify(next, null, 2)); setMessage('Cloned. This copy is yours to edit.') }
  function applyJson() { try { const next = JSON.parse(json) as Artifact; next.meta.builtIn = false; setArtifact(next); setMessage('Advanced JSON applied to the draft. Save to keep it.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid JSON.') } }

  return <div className="editor-page page-width">
    <div className="editor-toolbar"><button className="icon-button" onClick={onClose}><ArrowLeft /> Library</button><div><span className="eyebrow">{artifact.meta.kind.toUpperCase()} EDITOR</span><strong>{artifact.meta.name}</strong>{artifact.meta.builtIn && <small>Immutable built-in</small>}</div><div>{artifact.meta.builtIn ? <button className="primary" onClick={cloneToEdit}><Copy /> Clone to edit</button> : <button className="primary" onClick={save}><Save /> Save locally</button>}<button className="icon-button" onClick={() => downloadArtifact(artifact)}><Download /></button></div></div>
    <div className="editor-tabs"><button className={mode === 'guided' ? 'active' : ''} onClick={() => setMode('guided')}><Zap /> Guided builder</button><button className={mode === 'advanced' ? 'active' : ''} onClick={() => { setJson(JSON.stringify(artifact, null, 2)); setMode('advanced') }}><Code2 /> Advanced JSON</button>{isRole && <button className={mode === 'test' ? 'active' : ''} onClick={() => setMode('test')}><Beaker /> Test bench</button>}</div>
    {message && <div className="save-message"><Check /> {message}<button onClick={() => setMessage('')}><X /></button></div>}
    {!editable && <div className="built-in-banner"><strong>Built-ins cannot be edited directly.</strong><span>Clone this role to make your own version.</span></div>}
    {mode === 'guided' && isRole && <RoleBuilder role={artifact} traitCatalogue={traitCatalogue} editable={editable} onChange={(role) => setArtifact(role)} />}
    {mode === 'guided' && !isRole && <ContainerBuilder artifact={artifact} editable={editable} onChange={setArtifact} />}
    {mode === 'advanced' && <section className="advanced-editor"><div className="section-title"><div><h2>Full role definition</h2><p>Edit every part of this role as JSON.</p></div></div><textarea spellCheck={false} value={json} readOnly={!editable} onChange={(event) => setJson(event.target.value)} />{editable && <button className="secondary" onClick={applyJson}>Apply JSON to draft</button>}</section>}
    {mode === 'test' && isRole && <TestBench role={artifact} />}
  </div>
}

function RoleBuilder({ role, traitCatalogue, editable, onChange }: { role: RoleDefinition; traitCatalogue: TraitDefinition[]; editable: boolean; onChange: (role: RoleDefinition) => void }) {
  const patch = (change: Partial<RoleDefinition>) => editable && onChange({ ...role, ...change })
  function addTemplate(template: typeof TEMPLATES[number]) {
    const ability: AbilityDefinition = { id: `${role.id}.ability.${crypto.randomUUID().slice(0, 8)}`, name: template.name, kind: template.trigger.endsWith('.action') ? 'active' : 'passive', trigger: template.trigger, target: template.trigger.endsWith('.action') ? { label: 'Target', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true } : undefined, effects: [structuredClone(template.effect)], instructions: `Resolve the ${template.name.toLowerCase()} ability.` }
    patch({ abilities: [...role.abilities, ability] })
  }
  return <div className="builder-layout"><div className="builder-main">
    <section className="editor-section"><span className="section-kicker">IDENTITY</span><div className="form-grid"><label className="field wide"><span>Role name</span><input disabled={!editable} value={role.meta.name} onChange={(event) => patch({ meta: { ...role.meta, name: event.target.value } })} /></label><label className="field"><span>Faction reference</span><input disabled={!editable} value={role.faction} onChange={(event) => patch({ faction: event.target.value })} /></label><label className="field"><span>Version</span><input disabled={!editable} value={role.meta.version} onChange={(event) => patch({ meta: { ...role.meta, version: event.target.value } })} /></label><label className="field wide"><span>Public summary</span><input disabled={!editable} value={role.text.summary} onChange={(event) => patch({ text: { ...role.text, summary: event.target.value } })} /></label><label className="field wide"><span>Full public description</span><textarea disabled={!editable} value={role.text.description} onChange={(event) => patch({ text: { ...role.text, description: event.target.value } })} /></label><label className="field wide"><span>Categories · comma separated</span><input disabled={!editable} value={role.categories.join(', ')} onChange={(event) => patch({ categories: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label></div></section>
    <TraitPicker role={role} traitCatalogue={traitCatalogue} editable={editable} onChange={onChange} />
    <section className="editor-section"><div className="section-title"><div><span className="section-kicker">DEFINITION CONSTANTS</span><h2>Scenario-overridable values</h2><p>These are defaults owned by the role—not runtime targets or results.</p></div>{editable && <button className="secondary" onClick={() => patch({ constants: [...role.constants, { key: `value${role.constants.length + 1}`, label: 'New value', type: 'number', default: 1, scenarioOverridable: true }] })}><Plus /> Add value</button>}</div>{role.constants.length === 0 ? <div className="empty-editor">This role has no definition constants.</div> : <div className="constant-list">{role.constants.map((constant, index) => <div key={`${constant.key}-${index}`}><input disabled={!editable} value={constant.label} onChange={(event) => patch({ constants: role.constants.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><code>{constant.key}</code><input disabled={!editable} value={String(constant.default)} onChange={(event) => patch({ constants: role.constants.map((item, itemIndex) => itemIndex === index ? { ...item, default: item.type === 'number' ? Number(event.target.value) : event.target.value } : item) })} /><label><input disabled={!editable} type="checkbox" checked={constant.scenarioOverridable ?? false} onChange={(event) => patch({ constants: role.constants.map((item, itemIndex) => itemIndex === index ? { ...item, scenarioOverridable: event.target.checked } : item) })} /> Scenario may override</label>{editable && <button onClick={() => patch({ constants: role.constants.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></button>}</div>)}</div>}</section>
    <section className="editor-section"><div className="section-title"><div><span className="section-kicker">ABILITIES</span><h2>Triggers, conditions & effects</h2><p>Abilities run in order when their trigger occurs.</p></div></div><div className="template-row">{TEMPLATES.map((template) => <button key={template.name} disabled={!editable} onClick={() => addTemplate(template)}><Plus /> {template.name}</button>)}</div><div className="ability-list">{role.abilities.map((ability, index) => <AbilityCard key={ability.id} ability={ability} editable={editable} onChange={(next) => patch({ abilities: role.abilities.map((item, itemIndex) => itemIndex === index ? next : item) })} onDelete={() => patch({ abilities: role.abilities.filter((_, itemIndex) => itemIndex !== index) })} />)}</div></section>
  </div><aside className="builder-aside"><span className="eyebrow">DEFINITION HEALTH</span><h3>{role.abilities.length} abilities</h3><p>{role.requirements.length} required scenario capabilities</p><div className="tag-row">{role.requirements.map((requirement) => <span className="tag" key={requirement}>{requirement}</span>)}</div><hr /><strong>Portable identity</strong><code>{role.meta.namespace}<br />{role.meta.uuid}</code><small>Schema {role.meta.schemaVersion} · {role.meta.engineVersion}</small></aside></div>
}

function TraitPicker({ role, traitCatalogue, editable, onChange }: { role: RoleDefinition; traitCatalogue: TraitDefinition[]; editable: boolean; onChange: (role: RoleDefinition) => void }) {
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [colour, setColour] = useState('#8c6fd1')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [draggedTraitId, setDraggedTraitId] = useState('')
  const catalogue = useMemo(() => {
    const entries = new Map(traitCatalogue.map((trait) => [trait.id, trait]))
    ;(role.traitDefinitions ?? []).forEach((trait) => entries.set(trait.id, trait))
    role.traits.forEach((id) => { if (!entries.has(id)) entries.set(id, { id, label: id.split('.').at(-1)?.replace(/-/g, ' ') ?? id, colour: '#8c857b' }) })
    return [...entries.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [role.traitDefinitions, role.traits, traitCatalogue])
  const byId = new Map(catalogue.map((trait) => [trait.id, trait]))
  const selected = role.traits.map((id) => byId.get(id)!).filter(Boolean)
  const available = catalogue.filter((trait) => !role.traits.includes(trait.id))

  function addTrait(trait: TraitDefinition) {
    if (!editable || role.traits.includes(trait.id)) return
    const definitions = role.traitDefinitions ?? []
    onChange({ ...role, traits: [...role.traits, trait.id], traitDefinitions: definitions.some((entry) => entry.id === trait.id) ? definitions : [...definitions, trait] })
  }
  function removeTrait(id: string) { if (editable) onChange({ ...role, traits: role.traits.filter((traitId) => traitId !== id) }) }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const dragging = document.querySelector<HTMLElement>('[data-trait-dragging="true"]')
    const id = event.dataTransfer.getData('application/x-wherewolf-trait') || event.dataTransfer.getData('text/plain') || draggedTraitId || dragging?.dataset.traitId || document.body.dataset.dragTraitId || ''
    const trait = catalogue.find((entry) => entry.id === id)
    if (trait) addTrait(trait)
    setDraggedTraitId('')
  }
  function finishPointerDrag() {
    const id = document.body.dataset.dragTraitId
    const trait = catalogue.find((entry) => entry.id === id)
    if (trait) addTrait(trait)
    delete document.body.dataset.dragTraitId
    setDraggedTraitId('')
  }
  function createTrait() {
    const cleanLabel = label.trim()
    if (!cleanLabel) { setError('Enter a trait name.'); return }
    const slug = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trait'
    let id = `${role.meta.namespace}.trait.${slug}`
    if (catalogue.some((trait) => trait.id === id)) id = `${id}-${crypto.randomUUID().slice(0, 6)}`
    addTrait({ id, label: cleanLabel, colour, description: description.trim() || undefined })
    setLabel(''); setDescription(''); setError(''); setCreating(false)
  }

  return <section className="editor-section trait-builder">
    <div className="section-title"><div><span className="section-kicker">TRAITS</span><h2>What counts as this role?</h2><p>Click a trait or drag it onto the role. Trait labels and colours travel with exported roles.</p></div>{editable && <button className="secondary" onClick={() => setCreating((value) => !value)}><Plus /> New trait</button>}</div>
    <div className={`trait-dropzone ${selected.length ? '' : 'empty'}`} aria-label="Traits on this role" onDragOver={(event) => editable && event.preventDefault()} onDrop={handleDrop} onPointerUp={finishPointerDrag}>
      {selected.length === 0 && <p>Drop traits here</p>}
      {selected.map((trait) => <div className="trait-chip assigned" key={trait.id} style={{ borderColor: trait.colour, backgroundColor: `${trait.colour}22` }}><i style={{ backgroundColor: trait.colour }} /><span><strong>{trait.label}</strong><small>{trait.id}</small></span>{editable && <button aria-label={`Remove ${trait.label}`} onClick={() => removeTrait(trait.id)}><X /></button>}</div>)}
    </div>
    {creating && <div className="new-trait-form"><label className="field"><span>Trait name</span><input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Cursed" /></label><label className="field colour-field"><span>Colour</span><input aria-label="Trait colour" type="color" value={colour} onChange={(event) => setColour(event.target.value)} /></label><label className="field wide"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this trait mean?" /></label>{error && <div className="error-banner">{error}</div>}<button className="primary" onClick={createTrait}><Plus /> Create and add</button></div>}
    <div className="trait-library"><div><h3>Trait library</h3><span>{available.length} available</span></div><div className="trait-palette">{available.map((trait) => <button key={trait.id} data-trait-id={trait.id} disabled={!editable} draggable={editable} aria-label={`Add ${trait.label}`} title={trait.description || trait.id} onPointerDown={() => { document.body.dataset.dragTraitId = trait.id }} onDragStart={(event) => { document.body.dataset.dragTraitId = trait.id; event.currentTarget.dataset.traitDragging = 'true'; setDraggedTraitId(trait.id); event.dataTransfer.setData('application/x-wherewolf-trait', trait.id); event.dataTransfer.setData('text/plain', trait.id) }} onDragEnd={(event) => { addTrait(trait); delete event.currentTarget.dataset.traitDragging; delete document.body.dataset.dragTraitId; setDraggedTraitId('') }} onClick={() => addTrait(trait)} style={{ borderColor: trait.colour, backgroundColor: `${trait.colour}18` }}><GripVertical /><i style={{ backgroundColor: trait.colour }} /><span><strong>{trait.label}</strong><small>{trait.id}</small></span></button>)}</div></div>
  </section>
}

function AbilityCard({ ability, editable, onChange, onDelete }: { ability: AbilityDefinition; editable: boolean; onChange: (ability: AbilityDefinition) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false), [effectsJson, setEffectsJson] = useState(JSON.stringify(ability.effects, null, 2)), [jsonError, setJsonError] = useState('')
  const isOrderedAction = ability.trigger === 'setup.action' || ability.trigger === 'night.action'
  const groups = ACTION_GROUPS.filter((group) => !group.value || (ability.trigger === 'setup.action' ? ['setup-information', 'relationships'].includes(group.value) : !group.value.startsWith('setup-') && group.value !== 'relationships'))
  const selectedGroup = ACTION_GROUPS.find((group) => group.value === (ability.dependencyBarrier ?? ''))
  return <article className="ability-card">
    <header onClick={() => setOpen((value) => !value)}><span className={`ability-kind ${ability.kind}`}>{ability.kind}</span><div><strong>{ability.name}</strong><small>{ability.trigger} · {ability.effects.length} effect{ability.effects.length === 1 ? '' : 's'}</small></div><ChevronDown className={open ? 'rotated' : ''} /></header>
    {open && <div className="ability-body">
      <div className="form-grid">
        <label className="field"><span>Name</span><input disabled={!editable} value={ability.name} onChange={(event) => onChange({ ...ability, name: event.target.value })} /></label>
        <label className="field"><span>Trigger</span><select disabled={!editable} value={ability.trigger} onChange={(event) => { const trigger = event.target.value as TriggerType; const ordered = trigger === 'setup.action' || trigger === 'night.action'; onChange({ ...ability, trigger, dependencyBarrier: ordered ? ability.dependencyBarrier : undefined, simultaneous: ordered ? ability.simultaneous : undefined }) }}>{TRIGGERS.map((trigger) => <option key={trigger}>{trigger}</option>)}</select></label>
        <label className="field"><span>Kind</span><select disabled={!editable} value={ability.kind} onChange={(event) => onChange({ ...ability, kind: event.target.value as AbilityDefinition['kind'] })}><option>active</option><option>passive</option><option>shared-faction</option><option>status</option></select></label>
        {isOrderedAction && <label className="field timing-field"><span>When does this action happen?</span><select aria-label="Action timing" disabled={!editable} value={ability.dependencyBarrier ?? ''} onChange={(event) => onChange({ ...ability, dependencyBarrier: event.target.value || undefined })}>{ability.dependencyBarrier && !groups.some((group) => group.value === ability.dependencyBarrier) && <option value={ability.dependencyBarrier}>{ability.dependencyBarrier}</option>}{groups.map((group) => <option key={group.value || 'default'} value={group.value}>{group.label}</option>)}</select><small>{selectedGroup?.description ?? 'This custom action group is controlled by the scenario.'}</small></label>}
        {isOrderedAction && <label className="field timing-field"><span>Who performs this step?</span><select aria-label="Action participants" disabled={!editable} value={ability.simultaneous ? 'together' : 'separately'} onChange={(event) => onChange({ ...ability, simultaneous: event.target.value === 'together' ? (ability.simultaneous ?? { id: `${ability.id}.group`, label: ability.name }) : undefined })}><option value="separately">Each role separately</option><option value="together">All matching roles together</option></select><small>Matching grouped actions appear as one moderator step.</small></label>}
        {isOrderedAction && ability.simultaneous && <><label className="field"><span>Group label</span><input disabled={!editable} value={ability.simultaneous.label} onChange={(event) => onChange({ ...ability, simultaneous: { ...ability.simultaneous!, label: event.target.value } })} /></label><label className="field"><span>Group key</span><input disabled={!editable} value={ability.simultaneous.id} onChange={(event) => onChange({ ...ability, simultaneous: { ...ability.simultaneous!, id: event.target.value } })} /><small>Use the same key on actions that belong to this group.</small></label></>}
        <label className="field wide"><span>Moderator instruction</span><input disabled={!editable} value={ability.instructions ?? ''} onChange={(event) => onChange({ ...ability, instructions: event.target.value })} /></label>
      </div>
      <label className="field"><span>Effects</span><textarea className="effect-json" disabled={!editable} value={effectsJson} onChange={(event) => setEffectsJson(event.target.value)} /></label>
      {jsonError && <div className="error-banner">{jsonError}</div>}
      <div className="ability-actions">{editable && <><button className="secondary" onClick={() => { try { const effects = JSON.parse(effectsJson) as Effect[]; onChange({ ...ability, effects }); setJsonError('') } catch (error) { setJsonError(error instanceof Error ? error.message : 'Invalid effect JSON') } }}>Apply effects</button><button className="danger-link" onClick={onDelete}><Trash2 /> Delete ability</button></>}</div>
    </div>}
  </article>
}

function ContainerBuilder({ artifact, editable, onChange }: { artifact: PackDefinition | ScenarioDefinition; editable: boolean; onChange: (artifact: Artifact) => void }) {
  const isPack = 'roles' in artifact
  return <section className="editor-section container-builder"><span className="section-kicker">{artifact.meta.kind.toUpperCase()} IDENTITY</span><div className="form-grid"><label className="field wide"><span>Name</span><input disabled={!editable} value={artifact.meta.name} onChange={(event) => onChange({ ...artifact, meta: { ...artifact.meta, name: event.target.value } })} /></label><label className="field wide"><span>Description</span><textarea disabled={!editable} value={artifact.description} onChange={(event) => onChange({ ...artifact, description: event.target.value })} /></label></div>{isPack ? <><h2>Embedded roles</h2><p>Pack exports embed every role below, so the file is self-contained.</p><div className="embedded-list">{artifact.roles.map((role) => <div key={role.id}><strong>{role.meta.name}</strong><span>{role.faction.split('.').at(-1)}</span></div>)}</div></> : <><h2>Phase pipelines</h2><p>Use Advanced JSON for typed phase, capability, victory and dependency editing.</p><div className="pipeline-preview"><div><strong>One-time setup</strong>{artifact.setupPipeline.map((phase) => <span key={phase.id}>{phase.label} <small>{phase.type}</small></span>)}</div><div><strong>Repeating cycle</strong>{artifact.cyclePipeline.map((phase) => <span key={phase.id}>{phase.label} <small>{phase.type}</small></span>)}</div></div></>}</section>
}

function TestBench({ role }: { role: RoleDefinition }) {
  const triggers = useMemo(() => [...new Set(role.abilities.map((ability) => ability.trigger))], [role]), [trigger, setTrigger] = useState<TriggerType>(triggers[0] ?? 'night.action'), [result, setResult] = useState<ReturnType<typeof runRoleTestBench> | null>(null)
  return <section className="test-bench"><div><span className="section-kicker">TEST GAME</span><h2>Try an event</h2><p>Try this role with three sample players and review what happens.</p><label className="field"><span>Trigger</span><select value={trigger} onChange={(event) => setTrigger(event.target.value as TriggerType)}>{TRIGGERS.map((item) => <option key={item}>{item}</option>)}</select></label><button className="primary" onClick={() => setResult(runRoleTestBench(role, trigger))}><Beaker /> Run event</button></div><div className="bench-output"><span className="section-kicker">RESULTS</span>{!result ? <div className="empty-editor">Run an event to see what this role does.</div> : <>{result.trace.map((entry) => <article key={entry.id}><strong>{entry.source}</strong><p>{entry.message}</p>{entry.effects?.map((effect) => <code key={effect}>{effect}</code>)}</article>)}<details><summary>Resulting game state <ChevronDown /></summary><pre>{JSON.stringify({ players: result.state.players, relationships: result.state.relationships, facts: result.state.facts, winners: result.state.personalWinners }, null, 2)}</pre></details></>}</div></section>
}
