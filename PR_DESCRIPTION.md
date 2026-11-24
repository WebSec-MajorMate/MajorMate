# feat: 스터디 CRUD·카테고리·검색·가입 승인·멤버 관리 (feat/t1-study-group-management → dev)

## 목적

스터디 생성·수정·삭제, 카테고리, 모집글 검색, 가입 신청/승인/거절, 그룹 상세(탭)·멤버 관리 기능을 추가한다.

## 주요 변경

- 카테고리 필드(Study) 및 목록 검색(키워드/카테고리/진행방식/모집상태)
- 모집글 수정(`/studies/[id]/edit`), 삭제, 모집 마감/재개
- 상세 페이지 탭(소개/멤버), 멤버 목록(그룹장·멤버만 열람)
- 그룹장의 멤버 내보내기, 멤버 탈퇴, 신청 취소
- `StudyApplication.status`에 `REMOVED` 추가
- CSS(globals.css) 변경 없음

## 새로 추가한 파일

- lib/study-constants.ts. 카테고리 목록(전공·어학·자격증·코딩테스트·공모전·취업·기타)과 요일 상수. 서버와 클라이언트가 공유.
- app/studies/[studyId]/edit/page.tsx. 모집글 수정 페이지. 그룹장이 아니면 상세 페이지로 돌려보냅니다.
- components/studies/EditStudyForm.tsx. 그룹장이 모집글을 고칠 때 쓰는 폼.
- components/studies/ConfirmSubmitButton.tsx. 삭제, 탈퇴, 내보내기, 신청 취소 전에 확인 창을 띄우는 버튼.

## 테스트

- `npm run build` 통과, `tsc --noEmit` 통과
- Zod/Mongoose 스키마·쿼리 캐스팅 스크립트 검증 16건 통과
- 실제 MongoDB 연동 수동 테스트는 PR 리뷰어/작성자가 로컬에서 진행 필요
- `npm run lint`의 기존 오류 3건(`ProfileEditForm.tsx`)은 dev에도 있는 기존 문제

## 보안 영향

- 모든 변경 액션: 세션 사용자 + 서버 측 소유권 검증(쿼리 조건에 owner/applicant 포함)
- 입력은 Zod 검증, 검색어 정규식 이스케이프, 객체 입력은 enum/string 검증에서 차단
- 사용자 입력은 JSX 텍스트로만 렌더링 (XSS 없음)

## 주의사항

- 공통 파일 수정: 없음(스터디 도메인 파일만). 단, 삭제 시 `StudySchedule`(팀원 3 도메인)을 `study` 기준으로 함께 삭제함 → 팀원 3 확인 필요
