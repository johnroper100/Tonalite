cmake_minimum_required(VERSION 3.16)

project(tonalite VERSION 1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED True)

find_package(Threads REQUIRED)
find_package(ZLIB REQUIRED)
find_package(PkgConfig REQUIRED) 

include_directories(${ZLIB_INCLUDE_DIRS})

add_executable(tonalite main.cpp)

pkg_check_modules(tonalite "libola")

target_link_libraries(${PROJECT_NAME} Threads::Threads)

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

configure_file(index.html index.html COPYONLY)
configure_file(all.min.js all.min.js COPYONLY)
configure_file(vue-grid-layout.umd.min.js vue-grid-layout.umd.min.js COPYONLY)
configure_file(run.sh run.sh COPYONLY)