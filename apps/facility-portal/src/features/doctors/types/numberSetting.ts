export type NumberSettingProps = {
  title: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled: boolean;
  /** Amount the − / + buttons change the value by. */
  step?: number;
  onChange: (value: number) => void;
};
