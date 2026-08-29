import { ROWS } from "./layout";
import { Key } from "./Key";

export function KeyboardMain(props: { animals: Record<string, string> }) {
  return (
    <div className="thrum-flex thrum-flex-col thrum-gap-[5px]">
      {ROWS.map((row) => (
        <div className="thrum-flex thrum-gap-[5px]" key={row[0][0]}>
          {row.map((k, i) => {
            if (k[0] === "_spacer")
              return <div key={"spacer-" + i} className="thrum-w-[18px]" />;
            return (
              <Key
                key={k[0]}
                label={k[1]}
                w={k[2]}
                animal={props.animals[k[0]]}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
