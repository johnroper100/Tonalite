cmake_minimum_required(VERSION 3.16)

project(tonalite VERSION 1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED True)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS_DEBUG "-g")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

find_package(Threads REQUIRED)
find_package(ZLIB REQUIRED)
find_package(PkgConfig REQUIRED) 

include_directories(${ZLIB_INCLUDE_DIRS})

add_executable(tonalite main.cpp Fixture.cpp Group.cpp Cue.cpp Utilities.cpp)

pkg_check_modules(tonalite "libola")

add_subdirectory(zipper)

target_link_libraries(${PROJECT_NAME} Threads::Threads staticZipper)

target_link_libraries(tonalite ${tonalite_LIBRARIES})
add_definitions(${tonalite_CFLAGS} ${tonalite_CFLAGS_OTHER})

target_link_libraries(${PROJECT_NAME} ${ZLIB_LIBRARIES})
target_link_libraries(${PROJECT_NAME} ${Threads_LIBRARIES})

target_include_directories(tonalite PUBLIC
    "${PROJECT_SOURCE_DIR}"
    "${PROJECT_BINARY_DIR}"
    "${PROJECT_SOURCE_DIR}/uWebSockets/src"
    "${PROJECT_SOURCE_DIR}/uWebSockets/uSockets/src"
    "${PROJECT_SOURCE_DIR}/uWebSockets/uSockets"
)

target_link_libraries(tonalite ${CMAKE_SOURCE_DIR}/uWebSockets/uSockets/uSockets.a)