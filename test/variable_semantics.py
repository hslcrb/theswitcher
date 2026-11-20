"""Compare original and round-tripped variable-font behavior. No files are fetched."""
import json
import sys
from fontTools.ttLib import TTFont

def signature(path):
    with TTFont(path) as f:
        cmap=f.getBestCmap()
        axes={a.axisTag:(a.minValue,a.defaultValue,a.maxValue) for a in f["fvar"].axes}
        chars=[ord(c) for c in "한글가나다경축한漢韓字国語ABC123"]
        u=[i for i in chars if i in cmap]
        assert u and any(0xAC00 <= i <= 0xD7A3 for i in u), "expected Hangul coverage"
        glyph_set=f.getGlyphSet
        metrics={}
        if "wght" in axes:
            lo,default,hi=axes["wght"]
            samples={lo,default,hi}
            if len(samples)==2: samples.add((lo+hi)/2)
            for weight in sorted(samples):
                drawn=glyph_set(location={"wght": weight})
                metrics[str(weight)]=[round(drawn[cmap[code]].width,5) for code in u]
        return {"cmap":cmap,"axes":axes,"advances":metrics}

base=signature(sys.argv[1])
for path in sys.argv[2:]:
    assert signature(path)==base, path
print(json.dumps({"map_entries":len(base["cmap"]),"axes":base["axes"],"weights":list(base["advances"]),"tested_advances_per_weight":len(next(iter(base["advances"].values()),[]))},ensure_ascii=False))
