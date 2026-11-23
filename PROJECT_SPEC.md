# 🎓 MajorMate 프로젝트 종합 기획 및 아키텍처 명세서 (PROJECT_SPEC.md)

> **이 문서는 MajorMate 프로젝트의 전체 기획, 기술 아키텍처, 데이터베이스 스키마, 팀원 역할 분담, 그리고 웹 보안 체크리스트를 정의합니다.**  
> 팀원 및 AI 에이전트(Codex, Claude, ChatGPT 등)가 개발에 바로 착수할 수 있도록 명확한 기준을 제공합니다.

---

## 1. 프로젝트 개요

* **서비스명**: MajorMate (메이저메이트)
* **목표**: 단순한 전공 스터디 모집을 넘어, 대학생들을 위한 **다양한 분야 스터디 모집, 1:1 안심 쪽지, 스터디 일정 캘린더, 공모전/대외활동 팀빌딩, 커뮤니티**를 제공하는 통합 대학생 학업 협업 플랫폼.
* **과목**: 웹보안 팀 프로젝트 (Web Security Team Project)

---

## 2. 기술 스택 (Tech Stack)

| 구분 | 기술 스택 | 설명 |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16 (App Router)** | 서버 컴포넌트(RSC), Server Actions 기반 |
| **Frontend** | **React 19, TypeScript** | 모던 컴포넌트 아키텍처 |
| **Styling** | **Tailwind CSS v4** | 모던 유틸리티 CSS 및 반응형 디자인 |
| **Database** | **MongoDB (Atlas) + Mongoose 9** | NoSQL 도큐먼트 지향 데이터 모델링 |
| **Auth** | **NextAuth.js v5 (Auth.js)** | Credentials Provider 기반 세션/쿠키 인증 |
| **Deploy** | **Vercel** | Hobby 플랜 (GitHub Actions 연동 무료 배포 전략) |

---

## 3. 팀원 역할 분담 (Role Distribution)

```
[PM] 기획·통합 + 유저 기능 (회원 프로필, 평가/성향, 전체 아키텍처)
  ├── [팀원 1] 스터디그룹 (스터디 CRUD, 상세 페이지, 신청/멤버 관리)
  ├── [팀원 2] 커뮤니티 (게시판 CRUD, 댓글, 검색, 스크랩/즐겨찾기)
  ├── [팀원 3] 쪽지·일정 (1:1 쪽지함, 읽음 처리, 스터디 일정 캘린더)
  └── [팀원 4] 외부정보·홈 (공모전/대외활동 수집 및 표시, 메인 대시보드)
```

| 담당자 | 주요 역할 | 세부 구현 내용 | 담당 디렉터리 / 파일 |
| :--- | :--- | :--- | :--- |
| **PM** | **기획·통합 + 유저 기능** | • 전체 화면 흐름/DB 구조/API 표준화<br>• Git 병합, PR 리뷰, 발표 관리<br>• 회원 프로필, 마이페이지(`/my`)<br>• 스터디 참여율, 기여도(매너점수), 유저 성향 태그 | `src/app/my/`<br>`src/models/User.ts`<br>`src/auth.ts`<br>`src/app/actions/auth.ts` |
| **팀원 1** | **스터디그룹** | • 스터디 생성·수정·삭제 (카테고리/태그 지원)<br>• 스터디 상세 페이지 (탭 구조: 소개/멤버/공지/일정)<br>• 스터디 가입 신청, 팀장의 승인/거절, 멤버 관리 | `src/app/studies/`<br>`src/models/Study.ts`<br>`src/models/StudyApplication.ts`<br>`src/app/actions/studies.ts` |
| **팀원 2** | **커뮤니티** | • 게시판 글/댓글 CRUD (자유/질문/정보/후기)<br>• 카테고리 필터링 및 키워드 검색<br>• 관심 글 & 스터디 스크랩(즐겨찾기 - 장바구니 로직) | `src/app/community/`<br>`src/models/Post.ts`<br>`src/models/Comment.ts`<br>`src/models/Scrap.ts` |
| **팀원 3** | **쪽지 & 일정** | • 1:1 쪽지방 생성 및 송수신 (안심 익명/실명 쪽지)<br>• 안읽은 쪽지 카운트 및 읽음(`isRead`) 처리<br>• 스터디 모임 일정 캘린더 (자체 캘린더 + 구글캘린더 내보내기 링크) | `src/app/messages/`<br>`src/app/calendar/`<br>`src/models/MessageRoom.ts`<br>`src/models/Message.ts`<br>`src/models/StudySchedule.ts` |
| **팀원 4** | **외부정보 & 메인** | • 공모전, 대회, 대외활동 정보 수집 및 D-Day 카운트다운<br>• 카테고리 필터링(IT/SW, 창업, 아이디어 등) 및 검색<br>• 메인 홈(`/`) 통계 및 피드 대시보드 구성, 공통 UI 지원 | `src/app/activities/`<br>`src/app/page.tsx`<br>`src/models/Activity.ts`<br>`src/components/` |

---

## 4. 라우트 맵 (Route Structure)

```
src/app/
├── (auth)/
│   ├── login/page.tsx           # 로그인
│   └── register/page.tsx        # 회원가입 (전공, 학년, 성향 태그)
├── page.tsx                     # 메인 홈 대시보드 [팀원 4]
├── studies/                     # 스터디 도메인 [팀원 1]
│   ├── page.tsx                 # 스터디 모집글 목록 & 카테고리 검색
│   ├── new/page.tsx             # 스터디 생성 폼
│   └── [studyId]/
│       ├── page.tsx             # 스터디 상세 (개요/멤버/게시판/일정 탭)
│       └── manage/page.tsx      # 팀장 전용 멤버 승인/거절 관리
├── community/                   # 커뮤니티 도메인 [팀원 2]
│   ├── page.tsx                 # 게시글 목록, 카테고리, 검색
│   ├── new/page.tsx             # 글 작성
│   └── [postId]/page.tsx        # 글 상세 및 댓글/스크랩
├── activities/                  # 공모전/대외활동 도메인 [팀원 4]
│   └── page.tsx                 # 공모전 목록, D-Day, 외부 링크
├── calendar/                    # 일정 캘린더 도메인 [팀원 3]
│   └── page.tsx                 # 스터디 일정 월별/주별 뷰
├── messages/                    # 1:1 쪽지함 도메인 [팀원 3]
│   ├── page.tsx                 # 쪽지방 목록
│   └── [roomId]/page.tsx        # 1:1 대화방 상세
└── my/                          # 마이페이지 도메인 [PM]
    └── page.tsx                 # 내 프로필, 매너온도, 참여 스터디, 스크랩 보관함
```

---

## 5. 데이터베이스 스키마 설계 (Mongoose Models)

### 1) User (`src/models/User.ts`)
* `name`, `nickname`, `email`, `passwordHash` (select: false), `major`, `grade`, `role` ("USER" | "ADMIN")
* `mannerScore`: number (기본값 36.5, 범위 0~100)
* `studyTags`: string[] (예: `['온라인 선호', '자격증', '주말 스파르타']`)
* `studyStyle`: enum `["ONLINE", "OFFLINE", "HYBRID", "ANY"]`
* `bio`: string (한 줄 소개)

### 2) Study (`src/models/Study.ts`)
* `owner`: ObjectId (User 참조)
* `title`, `subject`, `description`
* `category`: string (예: 전공, 어학, 자격증, 코딩테스트, 공모전 등)
* `meetingDays`: string[], `meetingTime`: string, `meetingType`: "ONLINE" | "OFFLINE"
* `maxMembers`: number, `currentMembers`: number
* `status`: "RECRUITING" | "CLOSED"

### 3) StudyApplication (`src/models/StudyApplication.ts`)
* `study`: ObjectId (Study 참조)
* `applicant`: ObjectId (User 참조)
* `status`: "PENDING" | "ACCEPTED" | "REJECTED"
* `message`: string (지원 동기)

### 4) Post (`src/models/Post.ts`)
* `author`: ObjectId (User 참조), `authorNickname`: string
* `category`: "FREE" | "QUESTION" | "INFO" | "REVIEW"
* `title`: string, `content`: string
* `viewCount`: number, `likeCount`: number, `commentCount`: number

### 5) Comment (`src/models/Comment.ts`)
* `post`: ObjectId (Post 참조)
* `author`: ObjectId (User 참조), `authorNickname`: string
* `content`: string

### 6) MessageRoom & Message (`src/models/MessageRoom.ts`, `Message.ts`)
* **MessageRoom**:
  * `participants`: [ObjectId] (참여자 2명)
  * `study`: ObjectId (선택: 관련 스터디)
  * `lastMessage`: string, `lastMessageAt`: Date
* **Message**:
  * `room`: ObjectId (MessageRoom 참조)
  * `sender`: ObjectId, `receiver`: ObjectId
  * `content`: string, `isRead`: boolean

### 7) StudySchedule (`src/models/StudySchedule.ts`)
* `study`: ObjectId (Study 참조)
* `creator`: ObjectId (User 참조)
* `title`: string, `description`: string
* `startDate`: Date, `endDate`: Date, `location`: string
* `attendees`: [ObjectId]

### 8) Activity (`src/models/Activity.ts`)
* `title`: string, `organizer`: string
* `category`: "CONTEST" | "PROJECT" | "ACTIVITY" | "CLUB"
* `targetAudience`: string, `deadline`: Date, `linkUrl`: string, `imageUrl`: string, `tags`: [string]

### 9) Scrap (`src/models/Scrap.ts`)
* `user`: ObjectId (User 참조)
* `targetType`: "STUDY" | "POST" | "ACTIVITY"
* `targetId`: ObjectId
* Unique Index: `{ user: 1, targetType: 1, targetId: 1 }`

---

## 6. 🛡️ 웹보안 팀플 핵심 보안 체크리스트 (발표 및 평가 대비)

본 프로젝트는 **웹보안** 과목 프로젝트이므로 각 기능마다 OWASP Top 10 및 웹 취약점 대응을 필수로 적용합니다.

1. **Broken Access Control & IDOR (인가 취약점) 방어**
   * *위험*: URL 파라미터(`studyId`, `roomId`, `userId`)를 변조해 남의 쪽지함을 보거나, 스터디장이 아닌 사람이 가입 승인을 누르는 행위.
   * *대응*: Server Actions 및 Route Handler에서 세션의 `session.user.id`와 대상 데이터의 소유권을 서버 측에서 반드시 2중 검증.
2. **XSS (Cross-Site Scripting) 방어**
   * *위험*: 커뮤니티 게시글, 댓글, 쪽지 내용에 `<script>` 태그를 심어 타인의 쿠키/세션을 탈취.
   * *대응*: React JSX의 자동 HTML Entity 이스케이프 활용. 만약 HTML 렌더링이 필요할 경우 `DOMPurify`로 새니타이징.
3. **NoSQL Injection 방어**
   * *위험*: 쿼리 객체에 `{ "$gt": "" }` 등을 삽입하여 인증 우회나 비인가 데이터 조회.
   * *대응*: Zod 유효성 검사 스키마(`zod`)를 통해 모든 사용자 입력 타입을 엄격히 문자열/숫자로 강제 변환 후 Mongoose에 전달.
4. **BOLA (Broken Object Level Authorization) 방어**
   * *위험*: 쪽지 API 호출 시 자신이 참여하지 않은 `roomId`로 메시지를 전송하거나 열람.
   * *대응*: `MessageRoom.find({ _id: roomId, participants: session.user.id })` 형태로 참여자 조건 명시.
5. **CSRF (Cross-Site Request Forgery) 방어**
   * *대응*: Next.js App Router의 Server Actions는 기본적으로 `SameSite=Lax` 쿠키와 Host header 검증을 수행하여 CSRF를 원천 차단.

---

## 7. Git 협업 워크플로우

상세 규칙은 [`docs/TEAM_DEVELOPMENT_RULES.md`](docs/TEAM_DEVELOPMENT_RULES.md)를 따른다.

1. **브랜치 전략**:
   * `main`: 프로덕션 배포용 안정 브랜치 (Vercel 자동 배포 연동 대상)
   * `develop`: 팀원 작업 통합 및 테스트 브랜치 (기본 베이스 브랜치)
   * 기능별 브랜치: `feat/<역할>-<기능명>`
     * 예: `feat/pm-profile`, `feat/t1-study-tabs`, `feat/t2-posts`, `feat/t3-chat`, `feat/t4-activity-crawler`
2. **작업 흐름**:
   1. `git switch develop` && `git pull origin develop`
   2. `git switch -c feat/t1-study-tabs`
   3. 기능 작업 후 `develop` 브랜치를 대상으로 GitHub Pull Request(PR) 생성
   4. 팀원 리뷰와 승인 후 `develop`에 병합
   5. 통합 테스트 후 `develop` -> `main` PR을 생성하고 리뷰·승인 후 병합
3. 기존 `dev` 브랜치에서 `develop`으로의 전환 절차는 협업 규칙 문서의 **현재 `dev` 브랜치 전환** 항목을 따른다.
