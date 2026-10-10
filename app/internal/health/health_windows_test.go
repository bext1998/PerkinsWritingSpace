package health

import (
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// 意圖(PR #67 審查):檔案被其他程式獨占(外部編輯器、同步工具)時讀不到,檢查必須失敗並指出是哪個檔,
// 不能把沒讀到的檔案當成「沒有問題」。用 Windows 的 share mode 0 重現獨占。
func TestUnreadableFileFailsCheck(t *testing.T) {
	p, write := newProject(t)
	write("canon/鎖住.md", "---\nname: [壞\n---\n")
	name, err := syscall.UTF16PtrFromString(filepath.Join(p.Root, "canon", "鎖住.md"))
	if err != nil {
		t.Fatal(err)
	}
	h, err := syscall.CreateFile(name, syscall.GENERIC_READ, 0, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.CloseHandle(h)

	rep, err := Check(p)
	if err == nil || !strings.Contains(err.Error(), "canon/鎖住.md") {
		t.Fatalf("讀不到的檔案沒有讓檢查失敗:err=%v issues=%+v", err, rep.Issues)
	}
}
