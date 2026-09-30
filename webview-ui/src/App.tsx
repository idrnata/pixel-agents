import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { agentManager, agentOrchestrator, type AgentState, type AgentTask } from './agents/index.js';
import { toMajorMinor } from './changelogData.js';
import { AgentDetailsModal } from './components/AgentDetailsModal.js';
import { AgentsDrawer } from './components/AgentsDrawer.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { ConnectionIndicator } from './components/ConnectionIndicator.js';
import { DebugView } from './components/DebugView.js';
import { EditActionBar } from './components/EditActionBar.js';
import { MigrationNotice } from './components/MigrationNotice.js';
import { MobileHeader } from './components/MobileHeader.js';
import { ReportsDrawer } from './components/ReportsDrawer.js';
import { SettingsModal } from './components/SettingsModal.js';
import { TaskCreateModal } from './components/TaskCreateModal.js';
import { TasksDrawer } from './components/TasksDrawer.js';
import { VersionIndicator } from './components/VersionIndicator.js';
import { ZoomControls } from './components/ZoomControls.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { unlockAudio } from './notificationSound.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { exportLayoutToFile } from './office/layout/exportLayout.js';
import { migrateLayoutColors } from './office/layout/layoutSerializer.js';
import { getPetCount } from './office/sprites/petSpriteData.js';
import { EditTool, type OfficeLayout } from './office/types.js';
import { isBrowserRuntime, isE2E } from './runtime.js';
import { installTestHooks } from './testHooks.js';
import { transport } from './transport/index.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

if (isE2E) installTestHooks(officeStateRef);

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

function App() {
  // ── AI Agents & Tasks State ─────────────────────────────────
  const [agentStates, setAgentStates] = useState<AgentState[]>(() => agentManager.getAllStates());
  const [tasks, setTasks] = useState<AgentTask[]>(() => agentOrchestrator.getTasks());
  const [activeBottomTab, setActiveBottomTab] = useState<'office' | 'tasks' | 'agents' | 'reports'>('office');
  const [isTaskCreateOpen, setIsTaskCreateOpen] = useState(false);
  const [isTasksDrawerOpen, setIsTasksDrawerOpen] = useState(false);
  const [isAgentsDrawerOpen, setIsAgentsDrawerOpen] = useState(false);
  const [isReportsDrawerOpen, setIsReportsDrawerOpen] = useState(false);
  const [selectedAgentModal, setSelectedAgentModal] = useState<AgentState | null>(null);

  // Browser runtime: dispatch mock messages after the useExtensionMessages listener has been registered
  useEffect(() => {
    if (isBrowserRuntime && import.meta.env.DEV) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => dispatchMockMessages());
    }
  }, []);

  // Initialize the 3 core AI agents in OfficeState
  useEffect(() => {
    const timer = setTimeout(() => {
      const office = getOfficeState();
      // Ensure the 3 core agents are spawned in officeState at dedicated desks
      office.addAgent(1, 0, 0, undefined, false, 'MANAGEMENT'); // Manager (Indra)
      office.addAgent(2, 1, 0, undefined, false, 'RESEARCH');   // Researcher (Atlas)
      office.addAgent(3, 2, 0, undefined, false, 'QUANT_LAB');  // Analyst (Cyra)
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  // Listen to Agent events and update office visual & movement states
  useEffect(() => {
    const unsubscribe = agentManager.on((event) => {
      setAgentStates(agentManager.getAllStates());
      setTasks(agentOrchestrator.getTasks());

      const office = getOfficeState();
      if (event.characterId !== undefined) {
        const charId = event.characterId;

        // State-driven movement
        if (event.type === 'agent.moved' && event.targetLocation) {
          if (event.targetLocation === 'desk') {
            office.sendToSeat(charId);
          } else if (event.targetLocation === 'meeting') {
            office.sendToMeetingArea(charId);
          } else if (event.targetLocation === 'office') {
            office.sendToOfficeArea(charId);
          }
        }

        if (event.type === 'agent.thinking') {
          office.sendToSeat(charId);
          office.setAgentActive(charId, true);
          office.showWaitingBubble(charId);
        } else if (event.type === 'agent.reading' || event.type === 'agent.writing' || event.type === 'agent.working') {
          office.sendToSeat(charId);
          office.setAgentActive(charId, true);
          office.setAgentTool(charId, event.toolName || 'work');
        } else if (event.type === 'agent.completed') {
          office.setAgentActive(charId, false);
          office.setAgentTool(charId, null);
          office.dismissBubble(charId);
        } else if (event.type === 'agent.error') {
          office.setAgentActive(charId, false);
          office.setAgentTool(charId, 'error');
        }
      }
    });

    return unsubscribe;
  }, []);

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    ghostHeadlessAgents,
    setGhostHeadlessAgents,
    hooksInstalled,
    areaMappings,
    setAreaMappings,
    showAreas,
    setShowAreas,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);

  const currentMajorMinor = toMajorMinor(extensionVersion);

  const handleWhatsNewDismiss = useCallback(() => {
    transport.send({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  const handleOpenChangelog = useCallback(() => {
    setIsChangelogOpen(true);
    transport.send({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(() => {
    setAlwaysShowOverlay((prev) => {
      const newVal = !prev;
      transport.send({ type: 'setAlwaysShowLabels', enabled: newVal });
      return newVal;
    });
  }, []);

  const handleToggleGhostHeadlessAgents = useCallback(() => {
    const next = !ghostHeadlessAgents;
    setGhostHeadlessAgents(next);
    transport.send({ type: 'setGhostHeadlessAgents', enabled: next });
  }, [ghostHeadlessAgents, setGhostHeadlessAgents]);

  const handleSelectAgent = useCallback((id: number) => {
    const ag = agentManager.getAgentByCharacterId(id);
    if (ag) {
      setSelectedAgentModal(ag.getState());
    }
  }, []);

  const claudeHooksInstalled = hooksInstalled['claude'] === true;

  const handleAreaMappingChange = useCallback(
    (folderName: string, areaLabel: string, action: 'add' | 'remove') => {
      const current = areaMappings[folderName] ?? [];
      let nextLabels: string[];
      if (action === 'add') {
        if (current.includes(areaLabel)) return;
        nextLabels = [...current, areaLabel];
      } else {
        nextLabels = current.filter((l) => l !== areaLabel);
      }
      const next = { ...areaMappings };
      if (nextLabels.length === 0) {
        delete next[folderName];
      } else {
        next[folderName] = nextLabels;
      }
      setAreaMappings(next);
      getOfficeState().setAreaMappings(next);
      transport.send({ type: 'saveAreaMappings', mappings: next });
    },
    [areaMappings, setAreaMappings],
  );

  const onToggleShowAreas = useCallback(() => {
    const next = !showAreas;
    setShowAreas(next);
    transport.send({ type: 'setShowAreas', enabled: next });
  }, [showAreas, setShowAreas]);

  const isEditingAreas = editor.isEditMode && editorState.activeTool === EditTool.AREA_PAINT;
  const effectiveShowAreas = isEditingAreas || showAreas;
  const activeAreaLabel = isEditingAreas ? editor.selectedAreaLabel : null;

  useEffect(() => {
    if (!isE2E || typeof window === 'undefined') return;
    const hooks = (window.__pixelAgentsTestHooks ??= {});
    hooks.editorTileAction = (col, row) => editor.handleEditorTileAction(col, row);
    hooks.editorEraseAction = (col, row) => editor.handleEditorEraseAction(col, row);
    hooks.getShowAreas = () => effectiveShowAreas;
  }, [editor.handleEditorTileAction, editor.handleEditorEraseAction, effectiveShowAreas]);

  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((t) => t + 1), []),
    editor.handleToggleEditMode,
  );

  const handleExportLayout = useCallback(() => {
    const office = getOfficeState();
    exportLayoutToFile(office.getLayout());
  }, []);

  const handleImportLayout = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const layout = JSON.parse(text) as OfficeLayout;
        if (
          !layout ||
          typeof layout.cols !== 'number' ||
          typeof layout.rows !== 'number' ||
          !Array.isArray(layout.tiles) ||
          !Array.isArray(layout.furniture)
        ) {
          return;
        }
        migrateLayoutColors(layout);
        const office = getOfficeState();
        office.rebuildFromLayout(layout);
        editor.setLastSavedLayout(layout);
        editor.markClean();
        transport.send({ type: 'saveLayout', layout });
      } catch (err) {
        console.error('Failed to parse layout file:', err);
      }
    };
    input.click();
  }, [editor]);

  const areasAvailable = useMemo(() => {
    const current = getOfficeState().getLayout();
    return Array.isArray(current.areas) && current.areas.length > 0;
  }, [editor.editorTick]);

  const activeTask = tasks.find((t) => t.status === 'in_progress');
  const layout = getOfficeState().getLayout();
  const selectedFurniture = layout.furniture.find((f) => f.uid === editorState.selectedFurnitureUid);

  // Bottom toolbar tab selector
  const handleSelectBottomTab = (tab: 'office' | 'tasks' | 'agents' | 'reports') => {
    setActiveBottomTab(tab);
    if (tab === 'office') {
      setIsTasksDrawerOpen(false);
      setIsAgentsDrawerOpen(false);
      setIsReportsDrawerOpen(false);
      setIsTaskCreateOpen(false);
      setSelectedAgentModal(null);
      const office = getOfficeState();
      office.selectedAgentId = null;
      office.cameraFollowId = null;
    } else if (tab === 'tasks') {
      setIsTasksDrawerOpen(true);
      setIsAgentsDrawerOpen(false);
      setIsReportsDrawerOpen(false);
    } else if (tab === 'agents') {
      setIsAgentsDrawerOpen(true);
      setIsTasksDrawerOpen(false);
      setIsReportsDrawerOpen(false);
    } else if (tab === 'reports') {
      setIsReportsDrawerOpen(true);
      setIsTasksDrawerOpen(false);
      setIsAgentsDrawerOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-bg touch-none select-none">
      {/* ── Top Header for Mobile & Desktop (Brand, Status & New Task) ── */}
      <MobileHeader
        agents={agentStates}
        activeTask={activeTask}
        onOpenTasks={() => handleSelectBottomTab('tasks')}
        onOpenCreateTask={() => setIsTaskCreateOpen(true)}
      />

      {/* ── Primary Office Canvas (Always Dominant) ── */}
      <OfficeCanvas
        officeState={getOfficeState()}
        onClick={handleSelectAgent}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick + editorTickForKeyboard}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        showAreas={effectiveShowAreas}
        activeAreaLabel={activeAreaLabel}
      />

      <ToolOverlay
        officeState={getOfficeState()}
        agents={agents}
        agentTools={agentTools}
        subagentTools={subagentTools}
        subagentCharacters={subagentCharacters}
        containerRef={containerRef}
        zoom={editor.zoom}
        panRef={editor.panRef}
        onCloseAgent={(id) => transport.send({ type: 'closeAgent', id })}
        alwaysShowOverlay={alwaysShowOverlay}
      />

      {/* Debug view (gated on isDebugMode) */}
      {isDebugMode && (
        <DebugView
          officeState={getOfficeState()}
          agents={agents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={(id) => transport.send({ type: 'focusAgent', id })}
        />
      )}

      {/* Editor toolbar overlay when in edit mode */}
      {editor.isEditMode && (
        <>
          <EditorToolbar
            activeTool={editorState.activeTool}
            selectedTileType={editorState.selectedTileType}
            selectedFurnitureType={editorState.selectedFurnitureType}
            selectedFurnitureUid={editorState.selectedFurnitureUid}
            selectedFurnitureColor={selectedFurniture?.color ?? null}
            floorColor={editorState.floorColor}
            wallColor={editorState.wallColor}
            selectedWallSet={editorState.selectedWallSet}
            onToolChange={editor.handleToolChange}
            onTileTypeChange={editor.handleTileTypeChange}
            onFloorColorChange={editor.handleFloorColorChange}
            onWallColorChange={editor.handleWallColorChange}
            onWallSetChange={editor.handleWallSetChange}
            onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
            pickedFurnitureColor={editorState.pickedFurnitureColor}
            onPickedFurnitureColorChange={editor.handlePickedFurnitureColorChange}
            onFurnitureTypeChange={editor.handleFurnitureTypeChange}
            loadedAssets={loadedAssets}
            activePetTypes={layout.pets?.map((p) => p.petType) ?? []}
            petCount={getPetCount()}
            onPetToggle={editor.handlePetToggle}
            carpetVariant={editor.carpetVariant}
            carpetColor={editor.carpetColor}
            carpetAccentColor={editor.carpetAccentColor}
            onCarpetVariantChange={editor.handleCarpetVariantChange}
            onCarpetColorChange={editor.handleCarpetColorChange}
            onCarpetAccentColorChange={editor.handleCarpetAccentColorChange}
            areas={layout.areas ?? []}
            selectedAreaLabel={editor.selectedAreaLabel}
            workspaceFolders={workspaceFolders}
            areasAvailable={areasAvailable}
            areaMappings={areaMappings}
            onSelectArea={editor.handleSelectArea}
            onAddArea={editor.handleAddArea}
            onRemoveArea={editor.handleRemoveArea}
            onRenameArea={editor.handleRenameArea}
            onAreaColorChange={editor.handleAreaColorChange}
            onAreaMappingChange={handleAreaMappingChange}
          />
          <EditActionBar editor={editor} editorState={editorState} />
        </>
      )}

      {/* Zoom controls (Touch-friendly minimum 44px) */}
      <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

      {/* ── Bottom Mobile Toolbar (Office, Tasks, Agents, Reports) ── */}
      <BottomToolbar
        currentTab={activeBottomTab}
        onSelectTab={handleSelectBottomTab}
        isEditMode={editor.isEditMode}
        onToggleEditMode={editor.handleToggleEditMode}
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => setIsSettingsOpen((v) => !v)}
        tasks={tasks}
        agentCount={agentStates.length}
      />

      {/* ── Task Creation Modal ── */}
      <TaskCreateModal
        isOpen={isTaskCreateOpen}
        onClose={() => setIsTaskCreateOpen(false)}
        onSubmit={(title, description) => {
          unlockAudio();
          void agentOrchestrator.createTaskAndExecute(title, description);
          handleSelectBottomTab('tasks');
        }}
      />

      {/* ── Tasks & Execution Graph Drawer (Requirement 9) ── */}
      <TasksDrawer
        isOpen={isTasksDrawerOpen}
        onClose={() => {
          setIsTasksDrawerOpen(false);
          setActiveBottomTab('office');
        }}
        tasks={tasks}
        onOpenCreate={() => {
          setIsTasksDrawerOpen(false);
          setIsTaskCreateOpen(true);
        }}
      />

      {/* ── Agents Team Roster Drawer (Requirement 8) ── */}
      <AgentsDrawer
        isOpen={isAgentsDrawerOpen}
        onClose={() => {
          setIsAgentsDrawerOpen(false);
          setActiveBottomTab('office');
        }}
        agents={agentStates}
        onSelectAgent={(ag) => setSelectedAgentModal(ag)}
        onFocusCharacter={(charId) => {
          const office = getOfficeState();
          office.selectedAgentId = charId;
          office.cameraFollowId = charId;
          setIsAgentsDrawerOpen(false);
          setActiveBottomTab('office');
        }}
      />

      {/* ── Executive Master Reports Drawer (Requirement 10) ── */}
      <ReportsDrawer
        isOpen={isReportsDrawerOpen}
        onClose={() => {
          setIsReportsDrawerOpen(false);
          setActiveBottomTab('office');
        }}
        tasks={tasks}
        onOpenCreate={() => {
          setIsReportsDrawerOpen(false);
          setIsTaskCreateOpen(true);
        }}
      />

      {/* ── Agent Details Modal (Requirement 8) ── */}
      <AgentDetailsModal
        agent={selectedAgentModal}
        isOpen={selectedAgentModal !== null}
        onClose={() => setSelectedAgentModal(null)}
        onSendToDesk={(charId) => {
          getOfficeState().sendToSeat(charId);
        }}
        onSendToMeeting={(charId) => {
          getOfficeState().sendToMeetingArea(charId);
        }}
        onSendToOffice={(charId) => {
          getOfficeState().sendToOfficeArea(charId);
        }}
      />

      <VersionIndicator
        currentVersion={extensionVersion}
        lastSeenVersion={lastSeenVersion}
        onDismiss={handleWhatsNewDismiss}
        onOpenChangelog={handleOpenChangelog}
      />

      <ConnectionIndicator />

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        currentVersion={extensionVersion}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        alwaysShowOverlay={alwaysShowOverlay}
        onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
        ghostHeadlessAgents={ghostHeadlessAgents}
        onToggleGhostHeadlessAgents={handleToggleGhostHeadlessAgents}
        externalAssetDirectories={externalAssetDirectories}
        watchAllSessions={watchAllSessions}
        onToggleWatchAllSessions={() => {
          const newVal = !watchAllSessions;
          setWatchAllSessions(newVal);
          transport.send({ type: 'setWatchAllSessions', enabled: newVal });
        }}
        hooksInstalled={claudeHooksInstalled}
        onToggleHooksEnabled={() => {}}
        showAreas={showAreas}
        onToggleShowAreas={onToggleShowAreas}
        showAreasAvailable={areasAvailable}
        onExportLayout={handleExportLayout}
        onImportLayout={handleImportLayout}
      />

      {showMigrationNotice && (
        <MigrationNotice onDismiss={() => setMigrationNoticeDismissed(true)} />
      )}
    </div>
  );
}

export default App;
