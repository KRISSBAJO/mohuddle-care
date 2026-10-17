import { Image } from "react-native";

export function BrandMark({ size = 64 }: { size?: number }) {
  return <Image source={require("../../assets/mohuddle-icon-v2.png")} accessibilityLabel="Mohuddle" style={{ width: size, height: size, borderRadius: size * 0.24 }} resizeMode="contain" />;
}
