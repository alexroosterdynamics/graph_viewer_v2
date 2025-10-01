// app/components/FunctionsGraph.js
"use client";

import React from "react";
import Background from "./Background";
import Widget from "./widget";
import SelectionOverlay from "./SelectionOverlay";
import RightMenu from "./RightMenu";
import { useGraphController } from "./graph/controller";
import GraphCanvas from "./graph/GraphCanvas";
import { BACKGROUND } from "../constants";

export default function FunctionsGraph({ data, nodeStyle }) {
  const ctrl = useGraphController(data);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {BACKGROUND.use_custom_bg && <Background config={BACKGROUND} />}

      {/* Left controls */}
      <Widget
        draggable={ctrl.ui.draggable}
        showInterface={ctrl.ui.showInterface}
        blurInterface={ctrl.ui.blurInterface}
        blurAmount={ctrl.ui.blurAmount}
        visibleDepth={ctrl.ui.visibleDepth}
        labelsVisible={ctrl.ui.labelsVisible}
        onToggleDrag={(e) => ctrl.setUi((u) => ({ ...u, draggable: e.target.checked }))}
        onToggleInterface={(e) => ctrl.setUi((u) => ({ ...u, showInterface: e.target.checked }))}
        onToggleBlur={(e) => ctrl.setUi((u) => ({ ...u, blurInterface: e.target.checked }))}
        onDepthChange={ctrl.handleDepthChange}
        onBlurAmountChange={(e) =>
          ctrl.setUi((u) => ({
            ...u,
            blurAmount: Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)),
          }))
        }
        onToggleLabels={(e) => ctrl.setUi((u) => ({ ...u, labelsVisible: e.target.checked }))}
        legend={ctrl.legend}
      />

      {/* Right (Neo4j-like) details */}
      <RightMenu
        open={ctrl.rightOpen}
        kind={ctrl.rightKind}
        data={ctrl.rightData}
        onClose={ctrl.closeRight}
        onSaveNode={ctrl.saveRightNode}
        onSaveLink={ctrl.saveRightLink}
      />

      {/* Create/rename overlay */}
      <SelectionOverlay
        anchor={ctrl.panelAnchor}
        visible={ctrl.panelOpen && !!ctrl.selectedNode}
        options={ctrl.optionsForOverlay}
        onPick={ctrl.handlePickOption}
        lockedKey={ctrl.lockedKey}
      />

      {/* Inline rename box */}
      {ctrl.renderInlineRename()}

      {/* ForceGraph canvas — pass nodeStyle */}
      <GraphCanvas ctrl={ctrl} nodeStyle={nodeStyle} />
    </div>
  );
}
