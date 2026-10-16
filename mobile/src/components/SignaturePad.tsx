import { useRef, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/theme";
import { T } from "./ui";

export type Drawing = { strokes: [number, number][][]; box: { width: number; height: number } };
type Point = [number, number];

/* A box to sign in with a finger. The lines are sent as they are; the server draws the image. */
export function SignaturePad({ height = 170, label, onChange }: { height?: number; label: string; onChange: (drawing: Drawing | null) => void }) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const box = useRef({ width: 300, height });
  const all = useRef<Point[][]>([]);

  const at = (event: GestureResponderEvent): Point => [event.nativeEvent.locationX, event.nativeEvent.locationY];
  const start = (event: GestureResponderEvent) => {
    all.current = [...all.current, [at(event)]];
    setStrokes(all.current);
  };
  const move = (event: GestureResponderEvent) => {
    const last = all.current[all.current.length - 1] ?? [];
    all.current = [...all.current.slice(0, -1), [...last, at(event)]];
    setStrokes(all.current);
  };
  const end = () => onChange(all.current.length ? { strokes: all.current, box: box.current } : null);
  const clear = () => {
    all.current = [];
    setStrokes([]);
    onChange(null);
  };

  const d = (stroke: Point[]) => stroke.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <View style={{ gap: 6 }}>
      <View
        style={[styles.pad, { height }]}
        onLayout={(event: LayoutChangeEvent) => {
          box.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={end}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          {strokes.map((stroke, index) => (
            <Path key={index} d={d(stroke)} stroke="#1d2b4f" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {!strokes.length ? (
          <View pointerEvents="none" style={styles.hint}>
            <T size={13} color={colors.dim}>
              {label}
            </T>
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.line} />
      </View>
      {strokes.length ? (
        <Pressable accessibilityRole="button" onPress={clear} style={{ alignSelf: "flex-end" }}>
          <T size={13} weight="semibold" color={colors.sage}>
            Clear
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { borderWidth: 1.5, borderColor: colors.line, borderStyle: "dashed", borderRadius: 16, backgroundColor: "#fdfdfb", overflow: "hidden" },
  hint: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  line: { position: "absolute", left: 20, right: 20, bottom: 34, height: 1, backgroundColor: colors.line },
});
