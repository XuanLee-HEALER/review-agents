## Language-specific pitfalls to check (Go)

Static linters (`go vet`, `golangci-lint`) do not catch all semantic or concurrency bugs. For changed Go code, specifically inspect:
- **Goroutine & context leaks**: spawned goroutines without bounded exit/cancellation, missing `defer cancel()`, unclosed `http.Response.Body`, `sql.Rows`, or `time.Ticker`.
- **Typed `nil` interfaces**: returning a typed nil pointer (e.g. `var err *CustomErr = nil; return err`) as an `error` or interface value, making `err != nil` evaluate true.
- **Concurrency & locking**: unsynchronized map read/write, unbuffered channel send/recv deadlocks, copying `sync.Mutex`/`sync.WaitGroup` by value, or holding DB transactions/locks across external network I/O.
- **`defer` pitfalls**: ignoring errors from `Close()` on write handles, `defer` inside loops retaining resources until function exit, or unexpected interaction with named return values.
- **Slice aliasing & mutation**: `append` or sub-slicing silently overwriting a caller's backing array, or mutating shared structs/maps concurrently.
- **Precision & conversions**: float arithmetic on billing/credits/quotas, silent integer overflow or signed/unsigned narrowing casts.
