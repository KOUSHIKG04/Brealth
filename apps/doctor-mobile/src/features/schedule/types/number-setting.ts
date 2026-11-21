export type NumberSettingProps = {
  title: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
  stepper?: boolean;
  /** Amount the − / + buttons change the value by. */
  step?: number;
  /** Helper line under the control. */
  hint?: string;
  disabled?: boolean;
};
