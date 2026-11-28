# MajorMate 커뮤니티 개편 구현·검증 기록

기준: 사용자 제공 커뮤니티 시안과 구현 명세. 기존 Next.js 16.4.6 / React / TypeScript / Auth.js / MongoDB·Mongoose 구성을 유지했다.

## 실제 구현

- 시안의 3열 목록: 기존 공통 헤더·폰트·색상 토큰·footer를 유지하고 커뮤니티 전용 CSS를 적용했다. 1200px 미만에서는 오른쪽 정보를 아래로, 768px 미만에서는 한 열과 가로 메뉴로 전환한다.
- 기존 자유·질문·정보·후기 게시판을 재사용한다. 검색 범위(제목+내용/제목/내용/태그), 최신·인기·댓글순, 최근 24시간/7일, 질문 해결 상태, 페이지당 15개를 URL로 유지한다. 상세의 목록 복귀 링크가 조건을 복원한다.
- 실제 공지 지정, DB 기반 인기글 TOP 5, 미해결 질문 3개, 최근 7일 인기 태그 6개, 빈 상태·로딩·오류 재시도를 제공한다. 정적 예시 글이나 가짜 반응 수를 넣지 않았다.
- 게시글 작성·수정·소프트 삭제, 태그 최대 5개, 익명 선택, 실패 시 입력 보존, 제출 중 중복 제출 방지, 이탈 확인, 삭제 확인 모달을 연결했다.
- 댓글 CRUD, 1단계 답글, 등록순/최신순, 글쓴이 답변 채택·변경·취소를 구현했다. 삭제·숨김 댓글은 내용 대신 자리 표시를 남기고 채택을 해제한다. 댓글은 최대 500개를 표시한다.
- 익명 작성자의 실제 ID·닉네임을 공개 DTO에서 제거한다. 같은 글 안의 익명 참여자는 안정적인 번호로 표시하고 글쓴이는 별도로 표시한다. 작성 후 익명 여부 변경을 금지한다.
- 글·댓글 좋아요, 기존 Scrap 모델을 사용하는 스크랩, 내가 쓴 글·댓글 단 글·스크랩, 계정별 즐겨찾기를 연결했다. 댓글 단 글은 중복을 제거하고 마지막 활동일로 정렬한다.
- 인기 점수는 기간 내 생성된 공개 글의 해당 기간 내 좋아요 × 3 + 댓글 참여 계정 × 2다. 자기 반응을 제외하고 반복 댓글의 점수 기여를 계정당 한 번으로 제한한다. 조회수를 점수에 넣지 않는다. 사이드바와 인기순 목록은 같은 집계를 사용한다.
- 커뮤니티 전용 댓글·답글·채택 알림, 읽음/전체 읽음, 상세·댓글 링크를 제공한다. 알림에는 작성자 신원을 넣지 않고 삭제·숨김 대상을 제외한다.
- 게시글·댓글 신고와 중복 접수 방지, ADMIN만 접근 가능한 /community/moderation을 추가했다. 신고 사유·처리 상태·검토자·검토 시각·처리 결과를 DB에 기록한다. 관리자는 내용 검토, 숨김·복구, 최근 30개 글의 공지 지정·해제를 할 수 있다. 신고 수만으로 자동 삭제하지 않는다.
- 이미지 최대 4장·각 5MB를 실제 MongoDB의 개별 바이너리 문서로 저장한다. 기존 MY 증빙의 MongoDB 바이너리 저장 패턴을 참고하되 별도 컬렉션을 사용한다. 파일 확장자·선언 MIME·파일 시그니처·크기를 검사하고 SVG/HTML을 거부한다. 임시 이미지는 작성자만 접근할 수 있고 등록 시 소유권을 재검증한다. 임시 파일만 24시간 만료하며 등록 이미지는 만료를 해제한다. 이미지 확대·미리보기·제거·실패 표시를 제공한다.
- 조회수는 로그인 계정당 동일 글에 30분 버킷당 한 번 증가한다. 비로그인 조회는 추적 식별자를 만들지 않고 증가시키지 않는다. IP를 저장하지 않는다.

## 재사용과 변경 파일

공통 헤더, 홈, 스터디, 대외활동, 캘린더, 쪽지함, MY 컴포넌트, Auth.js 설정을 수정하지 않았다. 실제 HTTP 로그인 검증에서 발견한 DNS 문제를 해결하기 위해 공통 DB 연결 함수의 기존 DNS 설정을 Promise resolver에도 적용하는 최소 보완을 했다. 기존 스크랩 저장소와 MY 조회 경로를 유지하면서 삭제·숨김 글을 제외했다. 패키지 의존성과 잠금 파일 내용은 변경하지 않았다.

- src/app/community/page.tsx, [postId]/page.tsx, [postId]/edit/page.tsx: 목록·상세·편집 연동
- src/app/community/community.css, layout.tsx, loading.tsx, error.tsx: 전용 스타일·경계 상태
- src/app/community/moderation/page.tsx: 관리자 검토
- src/app/actions/community.ts: 기존 액션 재사용·확장, 서버 검증과 트랜잭션
- src/components/community/CommunityPostCard.tsx, PostForm.tsx, CommentForm.tsx: 실제 목록·입력 연동
- src/components/community/CommunityControls.tsx: 반응·신고·확인 모달·링크 복사
- src/components/community/AttachmentsInput.tsx: 업로드·미리보기·확대
- src/lib/community.ts, community-validation.ts, community-policy.ts, community-images.ts, community-request.ts: 조회·DTO·검증·권한·요청 제한
- src/lib/mongodb.ts: 기존 선택적 DNS 설정을 드라이버가 사용하는 Promise DNS에도 적용
- src/models/Post.ts, Comment.ts: 기존 모델에 호환 필드 추가
- src/models/CommunitySupport.ts, CommunityAttachment.ts: 지원 컬렉션
- src/app/api/community/attachments/route.ts, [attachmentId]/route.ts: 인증·동일 출처 검사와 바이트 저장·조회·임시 삭제
- tests/community.test.cjs, community.integration.test.cjs, community.http.test.cjs, community-loader.cjs: 단위·권한·DB 시나리오
- scripts/seed-community-demo.cjs: 명시적 별도 DB 데모 데이터
- package.json: test, typecheck, test:community:db, test:community:http, seed:community:demo 명령 추가

## DB 호환성과 운영 조건

기존 데이터 삭제·재시드·초기화를 실행하지 않았다. 기존 status가 없는 글·댓글은 활성 콘텐츠로 취급하고, 태그·첨부·익명·공지·채택 필드는 기본값으로 호환한다. 데이터 일괄 마이그레이션은 없다.

추가 컬렉션: CommunityReaction, BoardFavorite, CommunityReport, CommunityNotification, CommunityThrottle, CommunityView, CommunityAttachment. 좋아요·즐겨찾기·신고·알림·조회 버킷은 복합 고유 인덱스를 사용한다. 임시 첨부·요청 제한·조회 기록에는 TTL을 사용한다.

게시글/댓글/반응/스크랩/채택/첨부 연결의 동시성 처리는 MongoDB 트랜잭션을 사용하므로 replica set 또는 Atlas 환경이 필요하다. 실제 검증 환경에서 트랜잭션이 동작했다. 배포에서 인덱스 자동 생성을 끈 경우 해당 스키마 인덱스를 배포 절차로 생성해야 한다. 기존 Scrap의 중복 데이터가 있으면 고유 인덱스 오류를 수동 확인하며 자동 삭제하지 않는다.

## 보안

- 모든 쓰기는 세션으로 계정을 결정한다. 요청의 author/user/reporter/role을 사용하지 않는다. 관리자 역할은 JWT 주장 대신 DB에서 조회한다.
- 글·댓글 소유권, 댓글의 게시글 관계, 답글 1단계 제한, 채택 대상·작성자, 이미지 소유권을 서버에서 검사한다.
- 글·댓글은 React plain text 렌더링이다. 사용자 HTML을 직접 렌더링하지 않는다.
- ObjectId·enum·길이·페이지를 검증하고 검색 정규식을 이스케이프한다. 사용자 객체를 필터에 전달하지 않는다.
- 쓰기 UI는 Next.js Server Actions의 POST·Origin/Host 보호를 사용한다. 추가 이미지 POST/DELETE는 동일 출처 Origin을 검증한다.
- 요청 제한은 메모리 대신 MongoDB의 원자적 카운터를 사용해 여러 서버 인스턴스에서 공유한다. 글 5회/분, 댓글 15회/분, 반응 등 40회/분, 이미지 업로드 8회/분 등의 제한을 적용한다.
- 반응 수·댓글 수는 공개 조회 시 실제 DB로 집계한다. 공감·스크랩은 명시적 저장/해제 상태를 보내고 중복 고유 인덱스와 트랜잭션으로 보호한다.
- 이미지 응답은 nosniff, sandbox CSP, private/no-store를 사용한다. 숨김·삭제 글의 이미지는 404로 차단한다. 사용자 원본 파일명을 저장 경로나 응답 파일명에 쓰지 않는다.

## 검증 결과

- npm test: 단위·보안·기존 쪽지 회귀 24개 통과.
- COMMUNITY_DB_TEST=1 + npm run test:community:db: 실제 MongoDB 일회용 DB에서 통합 시나리오 1개 통과. 내부에서 A/B/ADMIN, 타인 글·댓글 수정/삭제 거부, 실제 이미지 POST/GET, 타인 첨부 연결 거부, 익명 DTO, 대댓글 관계, 동시 좋아요, 스크랩 계정 격리, 인기글 일치, 즐겨찾기, 알림 읽음, 채택·삭제 해제, 신고 중복·관리자 숨김/복구, 레거시 문서, 조회 중복, 요청 제한을 검증한다. 테스트 DB 이름은 majormate_community_test_<timestamp>로 제한하고 finally에서 그 DB만 제거한다.
- npm run typecheck: 통과.
- npm run lint: 오류 0, 기존 파일 경고 4개.
- npm run build: 컴파일·타입 검사·정적 페이지 생성 모두 통과. Next.js Cache Components와 충돌하던 첨부 라우트의 불필요한 runtime 선언을 제거했다.
- COMMUNITY_HTTP_TEST=1 + npm run test:community:http: 별도 일회용 DB와 실제 프로덕션 서버를 실행해 실제 Auth.js A/B 로그인, 글 등록·DB 저장, 공개 익명 HTML의 ID·닉네임 비노출, XSS 문자열 이스케이프, 다른 계정의 수정 요청 거부, 이미지 업로드 인증·교차 출처 차단을 검증한다. 테스트용 서버와 DB는 정리한다.
- 로컬 프로덕션 /community: HTTP 200과 실제 데이터 기반 새 화면 HTML 확인.
- 실제 브라우저·기기 검증: 브라우저 연결 호스트 사용 불가, 대체 Chrome 접근 승인 시간 초과로 미완료. 375/768/1280/1440px 화면, 키보드 모달·이탈 확인·첨부 미리보기, 브라우저 XSS 실행 여부는 실기기에서 추가 확인이 필요하다. CSS 구현을 실측 완료로 간주하지 않는다.

PowerShell 재검증:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
$env:COMMUNITY_DB_TEST = '1'
npm.cmd run test:community:db
npm.cmd run build
$env:COMMUNITY_HTTP_TEST = '1'
npm.cmd run test:community:http
```

## 별도 발표용 데이터

자동으로 실행하지 않는다. 실행하면 별도 데모 DB에만 카테고리별 15개(총 60개)의 [데모] 글과 댓글·답글·좋아요·스크랩·해결/미해결 상태를 만든다. 실제 사용자를 사칭하지 않는다. 중복 실행 시 같은 데모 계정·제목을 재사용하며 운영 DB를 초기화하지 않는다.

```powershell
$env:COMMUNITY_DEMO_DB = 'majormate_community_demo'
$env:COMMUNITY_DEMO_PASSWORD = '<12자 이상의 테스트 전용 비밀번호>'
npm.cmd run seed:community:demo
```

계정: demo0@community.invalid ~ demo3@community.invalid. demo3은 데모 DB에만 생성하는 관리자다. 앱에서 보려면 개발용 MONGODB_URI의 대상 DB를 해당 데모 DB로 명시적으로 설정한 별도 실행 환경을 사용한다. 현재 앱의 DB 연결을 자동 전환하지 않는다.

## 남은 확인과 범위

- 실제 브라우저 반응형·키보드·파일 선택 UI 검증은 위 이유로 남아 있다.
- 사용자 차단·전공 추천·임시저장·다크모드는 명세 P2로 구현하지 않았다.
- 익명 작성자에게 쪽지/프로필 링크를 추가하지 않았고 별도 학교 인증 배지도 만들지 않았다.
- 사용자가 확인할 화면: /community의 목록·인기글·활동, /community/new, 글 상세의 댓글·대댓글·채택·첨부, 본인 글 수정, 관리자 /community/moderation, 모바일 너비.
