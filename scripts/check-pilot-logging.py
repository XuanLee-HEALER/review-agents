"""Check suggested log-field equivalence against the reviewed dependency version."""
import subprocess
import tempfile
from pathlib import Path

TEST = r'''package probe
import (
 "bytes"
 "encoding/base64"
 "encoding/hex"
 "testing"
 "go.uber.org/zap"
 "go.uber.org/zap/zapcore"
)
func TestEquivalentFields(t *testing.T) {
 for _, console := range []bool{false, true} {
  for _, data := range [][]byte{nil, {}, {0}, {0xff, 0, 0x22}, bytes.Repeat([]byte{0x80}, 128)} {
   text := hex.EncodeToString(data)
   pairs := [][2]zap.Field{
    {zap.ByteString("hex", []byte(text)), zap.String("hex", text)},
    {zap.String("base64", base64.StdEncoding.EncodeToString(data)), zap.Binary("base64", data)},
   }
   for _, pair := range pairs {
    var outputs [2]string
    for i, field := range pair {
     cfg := zapcore.EncoderConfig{MessageKey:"msg", LineEnding:"\n"}
     var encoder zapcore.Encoder = zapcore.NewJSONEncoder(cfg)
     if console {encoder = zapcore.NewConsoleEncoder(cfg)}
     buffer, err := encoder.EncodeEntry(zapcore.Entry{Message:"entry"}, []zapcore.Field{field})
     if err != nil {t.Fatal(err)}
     outputs[i] = buffer.String(); buffer.Free()
    }
    if outputs[0] != outputs[1] {t.Fatalf("console=%v data=%x: %q != %q", console,data,outputs[0],outputs[1])}
   }
  }
 }
}
'''
with tempfile.TemporaryDirectory(prefix='review-zap-probe-') as directory:
    root = Path(directory)
    (root / 'go.mod').write_text('module reviewprobe\n\ngo 1.23\n\nrequire go.uber.org/zap v1.27.1\n')
    (root / 'logging_test.go').write_text(TEST)
    subprocess.run(['go', 'test', '-mod=mod', '-v', './...'], cwd=root, check=True)
