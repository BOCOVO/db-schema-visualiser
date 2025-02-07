import { Group, Layer, Stage } from "react-konva";
import { useEffect, useRef, type ReactNode } from "react";
import { type KonvaEventObject } from "konva/lib/Node";

import Toolbar from "../Toolbar/Toolbar";

import type { Stage as CoreStage } from "konva/lib/Stage";

import { useWindowSize } from "@/hooks/window";
import { useCursorChanger } from "@/hooks/cursor";
import { DIAGRAM_PADDING } from "@/constants/sizing";
import { useThemeColors, useThemeContext } from "@/hooks/theme";
import { Theme } from "@/types/theme";
import { useStageStartingState } from "@/hooks/stage";
import { stageStateStore } from "@/stores/stagesState";

interface DiagramWrapperProps {
  children: ReactNode;
}

const DiagramWrapper = ({ children }: DiagramWrapperProps) => {
  const scaleBy = 1.02;
  const { height: windowHeight, width: windowWidth } = useWindowSize();
  const { theme } = useThemeContext();
  const { onChange: onGrabbing, onRestore: onGrabRelease } =
    useCursorChanger("grabbing");
  const themeColors = useThemeColors();
  const stageRef = useRef<null | CoreStage>(null);

  // repositioning the stage only once
  const { scale: defaultStageScale, position: defaultStagePosition } =
    useStageStartingState();
  useEffect(() => {
    if (stageRef.current != null) {
      stageRef.current.scale({
        x: defaultStageScale,
        y: defaultStageScale,
      });
      stageRef.current.position(defaultStagePosition);
    }
  }, [defaultStageScale, defaultStagePosition]);

  const handleZooming = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.currentTarget as CoreStage;
    const oldScale = stage.scaleX();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const pointer = stage.getPointerPosition()!;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    // how to scale? Zoom in? Or zoom out?
    let direction = e.evt.deltaY > 0 ? 1 : -1;

    // when we zoom on trackpad, e.evt.ctrlKey is true
    // in that case lets revert direction
    if (e.evt.ctrlKey) {
      direction = -direction;
    }

    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stageStateStore.set({ scale: newScale, position: newPos });
  };

  const fitToView = () => {
    if (stageRef.current != null) {
      const stage = stageRef.current;
      const container = stage.container();
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;

      const contentBounds = stage.getClientRect({ relativeTo: stage });
      contentBounds.x = contentBounds.x - DIAGRAM_PADDING;
      contentBounds.y = contentBounds.y - DIAGRAM_PADDING;
      contentBounds.width = contentBounds.width + 2 * DIAGRAM_PADDING;
      contentBounds.height = contentBounds.height + 2 * DIAGRAM_PADDING;
      const scaleX = containerWidth / contentBounds.width;
      const scaleY = containerHeight / contentBounds.height;
      const scale = Math.min(scaleX, scaleY);

      stage.scale({ x: scale, y: scale });
      stage.position({
        x:
          (containerWidth - contentBounds.width * scale) / 2 -
          contentBounds.x * scale,
        y:
          (containerHeight - contentBounds.height * scale) / 2 -
          contentBounds.y * scale,
      });
      stage.batchDraw();
      stageStateStore.set({ scale, position: stage.position() });
    }
  };

  useEffect(() => {
    fitToView();
  }, [windowWidth, windowHeight]);

  return (
    <main
      className={`relative flex flex-col items-center ${theme === Theme.dark ? "dark" : ""}`}
    >
      <Stage
        draggable
        ref={stageRef}
        onDragStart={onGrabbing}
        onDragEnd={onGrabRelease}
        onWheel={handleZooming}
        width={windowWidth}
        height={windowHeight}
        style={{ width: "fit-content", backgroundColor: themeColors.bg }}
      >
        <Layer>
          <Group offsetX={-DIAGRAM_PADDING} offsetY={-DIAGRAM_PADDING}>
            {children}
          </Group>
        </Layer>
      </Stage>

      <Toolbar onFitToView={fitToView} />
    </main>
  );
};

export default DiagramWrapper;
