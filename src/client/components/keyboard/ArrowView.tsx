import { Key } from "./Key";

export function ArrowView(props: { animals: Record<string, string> }) {
  return (
    <div className="thrum-flex thrum-flex-col thrum-gap-[5px]">
      <div className="thrum-flex thrum-gap-[5px]">
        <div className="thrum-w-[30px]" />
        <Key label="↑" w={1} animal={props.animals["ArrowUp"]} />
        <div className="thrum-w-[30px]" />
      </div>
      <div className="thrum-flex thrum-gap-[5px]">
        <Key label="←" w={1} animal={props.animals["ArrowLeft"]} />
        <Key label="↓" w={1} animal={props.animals["ArrowDown"]} />
        <Key label="→" w={1} animal={props.animals["ArrowRight"]} />
      </div>
    </div>
  );
}
